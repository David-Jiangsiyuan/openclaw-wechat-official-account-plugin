/**
 * OpenClaw 微信公众号插件 - Gateway 模块
 * 
 * HTTP 服务器，接收微信服务器推送的消息
 */

import express, { Application, Request, Response } from "express";
import { WeChatAccount, GatewayInstance } from "./types";
import { decryptMessage, encryptMessage } from "./crypto";
import { submitToOpenClaw } from "./inbound";
import { loadConfig } from "./config";
import { verifySignature } from "./utils/signature";
import { parseWeChatXMLAsync } from "./utils/xml-parser";
import logger from "./utils/logger";

let serverInstance: any = null;
let isProcessing = false;

/**
 * 启动 Gateway
 */
export async function startGateway(account: WeChatAccount): Promise<GatewayInstance> {
  const app: Application = express();
  const config = loadConfig();
  
  logger.info("正在启动微信插件Gateway...", { port: account.port || 8080 });
  
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
      return res.status(403).send("Forbidden");
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
      
      // 2. 解密消息 (安全模式)
      let decryptedXML: string;
      try {
        const encryptedData = req.body;
        decryptedXML = decryptMessage(encryptedData, account.encodingAESKey);
      } catch (decryptError: any) {
        logger.error("消息解密失败", { error: decryptError.message });
        // 解密失败也返回success，避免微信重试
        return res.send("success");
      }
      
      // 3. 解析XML
      let message: any;
      try {
        message = await parseWeChatXMLAsync(decryptedXML);
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
      
      // 5. 异步处理消息 (不阻塞响应)
      setImmediate(async () => {
        if (isProcessing) {
          logger.warn("已有消息正在处理，跳过", { openid: message.FromUserName });
          return;
        }
        
        isProcessing = true;
        try {
          await submitToOpenClaw(account, message);
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
