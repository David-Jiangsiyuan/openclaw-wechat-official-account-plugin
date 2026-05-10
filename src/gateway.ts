/**
 * OpenClaw 微信公众号插件 - Gateway 模块 (v2.1.0)
 * 
 * HTTP 服务器，接收微信服务器推送的消息
 * 直接集成 OpenClaw QA Bus API，无需 OAPlugin
 */

import express, { Application, Request, Response } from "express";
import { WeChatAccount, GatewayInstance, WeChatInboundMessage } from "./types";
import { decryptMessage, encryptMessage } from "./crypto";
import { loadConfig } from "./config";
import { verifySignature } from "./utils/signature";
import { initOpenClawAPI, injectMessage, pollReplies } from "./openclaw-api";
import { sendMessage } from "./outbound";
import { initQueue, enqueue, getPendingMessages, getQueueStatus, updateStatus, cleanupQueue, getQueueItems } from "./queue";
import { parseWeChatXMLAsync } from "./utils/xml-parser";
import logger from "./utils/logger";

// OpenClaw QA Bus 配置
let openclawBaseUrl = "http://127.0.0.1:25265";
let openclawAccountId = "a366989004a7-im-bot";
let pluginWebhookUrl = "";
let pluginAuthToken = "";

let serverInstance: any = null;
let isProcessing = false;

// 兜底话术
const FALLBACK_MESSAGE = "您的客服开了个小差，请稍后再试";

/**
 * 启动 Gateway
 */
export async function startGateway(account: WeChatAccount): Promise<GatewayInstance> {
  const app: Application = express();
  const config = loadConfig();
  
  // 加载 OpenClaw 配置
  openclawBaseUrl = config.openclaw?.apiUrl || "http://127.0.0.1:25265";
  openclawAccountId = "a366989004a7-im-bot"; // 从 openclaw.json 获取
  
  logger.info("正在启动微信插件Gateway (v2.1.0)...", { 
    port: account.port || 8080,
    openclawBaseUrl,
    openclawAccountId
  });
  
  // 初始化 OpenClaw API
  initOpenClawAPI({
    baseUrl: openclawBaseUrl,
    accountId: openclawAccountId,
  });
  
  // 初始化消息队列
  initQueue({ maxSize: 1000, ttlMs: 5 * 60 * 1000 });
  
  // 解析 JSON body (用于 API 路由)
  app.use(express.json());
  
  // 解析原始Body（用于XML解密）
  app.use(express.raw({ type: "application/xml", limit: "1mb" }));
  app.use(express.raw({ type: "text/xml", limit: "1mb" }));
  app.use(express.text({ type: "*/*", limit: "1mb" }));
  
  // ========== 1. 微信服务器验证 (首次配置) ==========
  app.get("/wx/webhook", (req: Request, res: Response) => {
    const { signature, timestamp, nonce, echostr } = req.query;
    
    logger.info("收到微信服务器验证请求", { timestamp, nonce });
    
    // 验证签名
    if (!verifySignature(
      account.token, 
      timestamp as string, 
      nonce as string, 
      signature as string
    )) {
      logger.warn("微信服务器验证失败：签名不匹配", { signature, timestamp, nonce });
      res.status(403).send("Forbidden");
      return;  // ← 添加 return
    }
    
    // 验证通过，返回echostr
    logger.info("微信服务器验证成功");
    res.send(echostr);
  });
  
  // ========== 2. 接收消息推送 ==========
  app.post("/wx/webhook", async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      // 1. 验证签名
      const { signature, timestamp, nonce } = req.query;
      
      if (!verifySignature(
        account.token, 
        timestamp as string, 
        nonce as string, 
        signature as string
      )) {
        logger.warn("消息签名验证失败", { signature, timestamp, nonce });
        return res.status(403).send("Forbidden");
      }
      
      // 2. 处理消息 (支持加密和明文模式)
      let messageXML: string;
      let rawBody = req.body.toString();
      
      try {
        // 检查是否是加密消息 (通过检查是否包含<Encrypt>标签)
        const isEncrypted = rawBody.includes('<Encrypt>') || rawBody.includes('<Encrypt ');
        
        if (isEncrypted) {
          // 加密消息 - 需要解密
          logger.debug("检测到加密消息，开始解密");
          
          // 先解析外层XML获取Encrypt值
          const outerXML = await parseWeChatXMLAsync(rawBody);
          
          // 从原始XML中提取Encrypt标签内容
          const encryptMatch = rawBody.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
          if (!encryptMatch) {
            throw new Error("无法从XML中提取Encrypt内容");
          }
          
          const encryptedData = encryptMatch[1];
          messageXML = decryptMessage(encryptedData, account.encodingAESKey);
        } else {
          // 明文消息 - 直接使用
          logger.debug("检测到明文消息，无需解密");
          messageXML = rawBody;
        }
      } catch (error: any) {
        logger.error("消息处理失败", { error: error.message });
        // 发送兜底话术
        await sendFallbackMessage(account, req.body?.FromUserName || "unknown", FALLBACK_MESSAGE);
        return res.send("success");
      }
      
      // 3. 解析XML
      let message: any;
      try {
        // 如果是加密消息，messageXML已经是解密后的XML
        // 如果是明文消息，messageXML是原始XML
        message = await parseWeChatXMLAsync(messageXML);
        logger.info("收到微信消息", { 
          openid: message.FromUserName, 
          msgType: message.MsgType,
          content: message.Content,
        });
      } catch (parseError: any) {
        logger.error("XML解析失败", { error: parseError.message });
        // 发送兜底话术
        await sendFallbackMessage(account, message?.FromUserName || "unknown", FALLBACK_MESSAGE);
        return res.send("success");
      }
      
      // 4. 立即返回success (5秒超时处理)
      res.send("success");
      
      // 5. 异步处理消息 (不阻塞响应)
      setImmediate(async () => {
        if (isProcessing) {
          logger.warn("已有消息正在处理，跳过", { openid: message.FromUserName });
          return;
        }
        
        isProcessing = true;
        try {
          // 注入消息到 OpenClaw QA Bus
          const injectResult = await injectMessage({
            conversationId: message.FromUserName,
            senderId: message.FromUserName,
            text: message.Content || "[空消息]",
          });
          
          logger.info("消息已注入 OpenClaw", { messageId: injectResult.message?.id });
          
          // 轮询获取回复
          const pollResult = await pollReplies({
            cursor: 0,
            timeoutMs: 30000,
          });
          
          // 处理回复
          if (pollResult.events && pollResult.events.length > 0) {
            for (const event of pollResult.events) {
              if (event.kind === "outbound-message" && event.message) {
                const replyText = event.message.text;
                logger.info("收到 OpenClaw 回复", { 
                  openid: message.FromUserName,
                  reply: replyText.substring(0, 100)
                });
                
                // 发送回复给用户
                await sendMessage(account, { openid: message.FromUserName }, replyText, "text");
              }
            }
          } else {
            logger.warn("未收到 OpenClaw 回复");
            // 发送兜底话术
            await sendMessage(account, { openid: message.FromUserName }, FALLBACK_MESSAGE, "text");
          }
          
          const processingTime = Date.now() - startTime;
          logger.info(`消息处理完成，耗时: ${processingTime}ms`, { 
            openid: message.FromUserName,
            processingTime 
          });
        } catch (error: any) {
          logger.error("消息处理失败", { 
            error: error.message, 
            stack: error.stack,
            openid: message.FromUserName 
          });
          // 发送兜底话术
          await sendMessage(account, { openid: message.FromUserName }, FALLBACK_MESSAGE, "text");
        } finally {
          isProcessing = false;
        }
      });
      
    } catch (error: any) {
      logger.error("处理微信消息异常", { error: error.message, stack: error.stack });
      // 异常时也返回success，避免微信重试
      if (!res.headersSent) {
        res.send("success");
      }
      // 发送兜底话术
      await sendFallbackMessage(account, req.body?.FromUserName || "unknown", FALLBACK_MESSAGE);
    }
  });
  
  // ========== 3. 健康检查 ==========
  app.get("/health", (req: Request, res: Response) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      account: account.id,
      uptime: process.uptime(),
    });
  });
  
  // ========== 4. 获取服务器状态 ==========
  app.get("/status", (req: Request, res: Response) => {
    res.json({
      status: "running",
      account: account.id,
      appId: account.appId,
      port: account.port,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });
  
  // ========== 5. 接收 OpenClaw Plugin 回复 ==========
  app.post("/wx/reply", express.json(), async (req: Request, res: Response) => {
    try {
      // 验证认证 token
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${pluginAuthToken}`) {
        logger.warn("Plugin 回复认证失败");
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { openid, content, msgType = "text" } = req.body;
      
      if (!openid || !content) {
        return res.status(400).json({ error: "Missing openid or content" });
      }
      
      logger.info("收到 Plugin 回复", { openid, contentLength: content.length });
      
      // 发送到微信
      const { sendMessage } = await import("./outbound");
      await sendMessage(account, { openid }, content, msgType);
      
      logger.info("Plugin 回复发送成功", { openid });
      res.json({ success: true });
    } catch (error: any) {
      logger.error("处理 Plugin 回复失败", { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });
  
  // ========== 6. 消息队列 API (OpenClaw 主动推送) ==========
  app.post("/api/queue/enqueue", express.json(), async (req: Request, res: Response) => {
    try {
      const { openid, content, msgType = "text" } = req.body;
      
      if (!openid || !content) {
        return res.status(400).json({ error: "Missing openid or content" });
      }
      
      const item = enqueue({ openid, content, msgType });
      logger.info("消息入队", { id: item.id, openid });
      
      res.json({ success: true, item });
    } catch (error: any) {
      logger.error("入队失败", { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });
  
  // 获取待处理消息
  app.get("/api/queue/pending", (req: Request, res: Response) => {
    const messages = getPendingMessages();
    res.json({ messages });
  });
  
  // 获取队列状态
  app.get("/api/queue/status", (req: Request, res: Response) => {
    const status = getQueueStatus();
    res.json(status);
  });
  
  // 更新消息状态
  app.post("/api/queue/update", express.json(), async (req: Request, res: Response) => {
    try {
      const { id, status } = req.body;
      
      if (!id || !status) {
        return res.status(400).json({ error: "Missing id or status" });
      }
      
      const success = updateStatus(id, status);
      res.json({ success });
    } catch (error: any) {
      logger.error("更新状态失败", { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });
  
  // 清理队列
  app.post("/api/queue/cleanup", (req: Request, res: Response) => {
    const removed = cleanupQueue();
    res.json({ removed });
  });
  
  // ========== 7. 发送队列消息到微信 (轮询或触发) ==========
  app.post("/api/queue/process", async (req: Request, res: Response) => {
    try {
      const pending = getPendingMessages();
      
      if (pending.length === 0) {
        return res.json({ processed: 0 });
      }
      
      let processed = 0;
      for (const item of pending) {
        try {
          updateStatus(item.id, "processing");
          await sendMessage(account, { openid: item.openid }, item.content, item.msgType);
          updateStatus(item.id, "completed");
          processed++;
          logger.info("队列消息发送成功", { id: item.id, openid: item.openid });
        } catch (error: any) {
          updateStatus(item.id, "failed");
          logger.error("队列消息发送失败", { id: item.id, error: error.message });
        }
      }
      
      res.json({ processed, total: pending.length });
    } catch (error: any) {
      logger.error("处理队列失败", { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });
  
  // ========== 8. 定时清理任务 ==========
  setInterval(() => {
    const removed = cleanupQueue();
    if (removed > 0) {
      logger.info("定时清理队列", { removed });
    }
  }, 60 * 1000); // 每分钟清理一次
  
  // 启动服务器
  const port = account.port || 8080;
  const server = app.listen(port, "0.0.0.0", () => {
    logger.info(`微信插件Gateway启动成功`, { port, path: "/wx/webhook" });
  });
  
  // 错误处理
  server.on("error", (error: any) => {
    logger.error("Gateway服务器错误", { error: error.message });
  });
  
  serverInstance = server;
  
  return {
    server,
    dispose: async () => {
      return new Promise<void>((resolve) => {
        server.close(() => {
          logger.info("微信插件Gateway已停止");
          serverInstance = null;
          resolve();
        });
      });
    },
  };
}

/**
 * 停止 Gateway
 */
export async function stopGateway(account: WeChatAccount): Promise<void> {
  if (serverInstance) {
    logger.info("正在停止微信插件Gateway...");
    serverInstance.close();
    serverInstance = null;
    logger.info("微信插件Gateway已停止");
  }
}

/**
 * 获取Gateway状态
 */
export function getGatewayStatus(): { isRunning: boolean; address: any } {
  if (!serverInstance) {
    return { isRunning: false, address: null };
  }
  
  return {
    isRunning: true,
    address: serverInstance.address(),
  };
}

/**
 * 推送消息到 OpenClaw Plugin
 */
async function pushMessageToPlugin(
  account: WeChatAccount, 
  message: any, 
  rawBody: string
): Promise<void> {
  try {
    // 构建推送消息体
    const payload = {
      timestamp: new Date().toISOString(),
      account: {
        id: account.id,
        appId: account.appId,
      },
      message: {
        fromUserName: message.FromUserName,
        toUserName: message.ToUserName,
        msgType: message.MsgType,
        content: message.Content || "",
        msgId: message.MsgId || "",
        createTime: message.CreateTime || Date.now(),
        // 其他字段
        mediaId: message.MediaId || "",
        format: message.Format || "",
        recognition: message.Recognition || "",
        thumbMediaId: message.ThumbMediaId || "",
        locationX: message.Location_X || "",
        locationY: message.Location_Y || "",
        scale: message.Scale || "",
        label: message.Label || "",
        title: message.Title || "",
        description: message.Description || "",
        url: message.Url || "",
        event: message.Event || "",
        eventKey: message.EventKey || "",
      },
      rawBody: rawBody, // 原始 XML，供 Plugin 解密用
    };
    
    logger.info("推送消息到 Plugin", { 
      pluginWebhook: pluginWebhookUrl, 
      openid: message.FromUserName 
    });
    
    // 发送 HTTP POST 请求到 Plugin webhook
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5秒超时
    
    try {
      const response = await fetch(pluginWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${pluginAuthToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Plugin 返回错误: ${response.status} ${errorText}`);
      }
      
      logger.info("消息推送成功", { openid: message.FromUserName });
    } catch (error: any) {
      clearTimeout(timeout);
      throw error;
    }
  } catch (error: any) {
    logger.error("推送消息到 Plugin 失败", { 
      error: error.message, 
      pluginWebhook: pluginWebhookUrl 
    });
    throw error;
  }
}

/**
 * 发送兜底话术
 */
async function sendFallbackMessage(account: WeChatAccount, openid: string, message: string): Promise<void> {
  try {
    logger.info("发送兜底话术", { openid, message });
    
    const { sendMessage } = await import("./outbound");
    await sendMessage(account, { openid }, message, "text");
    
    logger.info("兜底话术发送成功", { openid });
  } catch (error: any) {
    logger.error("兜底话术发送失败", { error: error.message, openid });
  }
}
