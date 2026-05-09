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
import * as signature from "./utils/signature";
import * as xmlParser from "./utils/xml-parser";

let serverInstance: any = null;

/**
 * 启动 Gateway
 */
export async function startGateway(account: WeChatAccount): Promise<GatewayInstance> {
  const app: Application = express();
  const config = loadConfig();
  
  // 解析原始Body（用于XML解密）
  app.use(express.raw({ type: "text/xml", limit: "1mb" }));
  app.use(express.json());
  
  // ========== 1. 微信服务器验证 (首次配置) ==========
  app.get("/wx/webhook", (req: Request, res: Response) => {
    const { signature, timestamp, nonce, echostr } = req.query;
    
    console.log("收到微信服务器验证请求", { timestamp, nonce });
    
    // 验证签名
    if (!signature.verifySignature(account.token, timestamp as string, nonce as string, signature as string)) {
      console.warn("微信服务器验证失败：签名不匹配");
      return res.status(403).send("Forbidden");
    }
    
    // 验证通过，返回echostr
    console.log("微信服务器验证成功");
    res.send(echostr);
  });
  
  // ========== 2. 接收消息推送 ==========
  app.post("/wx/webhook", async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      // 1. 验证签名
      const { signature, timestamp, nonce } = req.query;
      if (!signature.verifySignature(account.token, timestamp as string, nonce as string, signature as string)) {
        console.warn("消息签名验证失败");
        return res.status(403).send("Forbidden");
      }
      
      // 2. 解密消息 (安全模式)
      const encryptedData = req.body;
      const decryptedXML = decryptMessage(encryptedData, account.encodingAESKey);
      
      // 3. 解析XML
      const message = xmlParser.parseWeChatXML(decryptedXML);
      console.log("收到微信消息", { 
        openid: message.FromUserName, 
        msgType: message.MsgType,
        content: message.Content,
      });
      
      // 4. 立即返回success (5秒超时处理)
      res.send("success");
      
      // 5. 异步处理消息 (不阻塞响应)
      setImmediate(async () => {
        try {
          await submitToOpenClaw(account, message);
          const processingTime = Date.now() - startTime;
          console.log(`消息处理完成，耗时: ${processingTime}ms`);
        } catch (error: any) {
          console.error("消息处理失败", { error: error.message, stack: error.stack });
        }
      });
      
    } catch (error: any) {
      console.error("处理微信消息异常", { error: error.message });
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
    });
  });
  
  // 启动服务器
  const port = account.port || 8080;
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`微信插件Gateway启动成功`, { port, path: "/wx/webhook" });
  });
  
  serverInstance = server;
  
  return {
    server,
    dispose: async () => {
      return new Promise<void>((resolve) => {
        server.close(() => {
          console.log("微信插件Gateway已停止");
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
    serverInstance.close();
    serverInstance = null;
  }
}
