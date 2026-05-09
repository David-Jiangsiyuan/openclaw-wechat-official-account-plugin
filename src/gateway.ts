/**
 * OpenClaw 微信公众号插件 - Gateway 模块
 * 
 * HTTP 服务器，接收微信服务器推送的消息
 */

import express, { Application, Request, Response } from "express";
import { WeChatAccount, GatewayInstance, WeChatInboundMessage } from "./types";
import { decryptMessage, encryptMessage } from "./crypto";
import { loadConfig } from "./config";
import { verifySignature } from "./utils/signature";
import { parseWeChatXMLAsync } from "./utils/xml-parser";
import logger from "./utils/logger";

let pluginWebhookUrl = "";
let pluginAuthToken = "";

let serverInstance: any = null;
let isProcessing = false;

/**
 * 启动 Gateway
 */
export async function startGateway(account: WeChatAccount): Promise<GatewayInstance> {
  const app: Application = express();
  const config = loadConfig();
  
  // 加载 Plugin 配置
  pluginWebhookUrl = config.plugin?.webhookUrl || "http://localhost:3000/wechat/message";
  pluginAuthToken = config.plugin?.authToken || "default-test-token-2026";
  
  logger.info("正在启动微信插件Gateway...", { 
    port: account.port || 8080,
    pluginWebhook: pluginWebhookUrl 
  });
  
  // 解析原始Body（用于XML解密）
  app.use(express.raw({ type: "text/xml", limit: "1mb" }));
  app.use(express.json());
  
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
        return res.send("success");
      }
      
      // 4. 立即返回success (5秒超时处理)
      res.send("success");
      
      // 5. 异步推送消息到 OpenClaw Plugin (不阻塞响应)
      setImmediate(async () => {
        if (isProcessing) {
          logger.warn("已有消息正在处理，跳过", { openid: message.FromUserName });
          return;
        }
        
        isProcessing = true;
        try {
          await pushMessageToPlugin(account, message, rawBody);
          const processingTime = Date.now() - startTime;
          logger.info(`消息推送完成，耗时: ${processingTime}ms`, { 
            openid: message.FromUserName,
            processingTime 
          });
        } catch (error: any) {
          logger.error("消息推送失败", { 
            error: error.message, 
            stack: error.stack,
            openid: message.FromUserName 
          });
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
    const response = await fetch(pluginWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${pluginAuthToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000), // 5秒超时
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Plugin 返回错误: ${response.status} ${errorText}`);
    }
    
    logger.info("消息推送成功", { openid: message.FromUserName });
  } catch (error: any) {
    logger.error("推送消息到 Plugin 失败", { 
      error: error.message, 
      pluginWebhook: pluginWebhookUrl 
    });
    throw error;
  }
}
