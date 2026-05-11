/**
 * OpenClaw 微信公众号插件 - Gateway 模块 (v3.0.0)
 *
 * HTTP 服务器，接收微信服务器推送的消息
 * 支持消息模式: plain/safe/compat
 * 支持回复模式: passive/active
 */

import express, { Application, Request, Response } from "express";
import { WeChatAccount, GatewayInstance } from "./types";
import { decryptMessage, MsgCrypt } from "./crypto";
import { loadConfig } from "./config";
import { verifySignature } from "./utils/signature";
import { parseWeChatXMLAsync } from "./utils/xml-parser";
import logger from "./utils/logger";
import { interactionManager } from "./interaction-window";
import { sendMessage, generatePassiveReplyXML } from "./outbound";

let serverInstance: any = null;

// 兜底话术
const FALLBACK_MESSAGE = "您的客服开了个小差，请稍后再试";

/**
 * 检测消息模式
 */
function detectMessageMode(rawBody: string, account: WeChatAccount): 'plain' | 'safe' {
  const hasEncrypt = rawBody.includes('<Encrypt>') || rawBody.includes('<Encrypt ');
  if (hasEncrypt) return 'safe';
  return 'plain';
}

/**
 * 解密微信消息
 */
async function decryptWeChatMessage(
  rawBody: string,
  account: WeChatAccount
): Promise<{ messageXML: string; isEncrypted: boolean }> {
  const mode = detectMessageMode(rawBody, account);

  if (mode === 'safe') {
    logger.debug("检测到加密消息，开始解密");

    if (!account.encodingAESKey) {
      throw new Error("收到加密消息但未配置 encodingAESKey");
    }

    const encryptMatch = rawBody.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
    if (!encryptMatch) {
      throw new Error("无法从XML中提取Encrypt内容");
    }

    const encryptedData = encryptMatch[1];
    const messageXML = decryptMessage(encryptedData, account.encodingAESKey);

    return { messageXML, isEncrypted: true };
  } else {
    logger.debug("检测到明文消息，无需解密");
    return { messageXML: rawBody, isEncrypted: false };
  }
}

/**
 * 启动 Gateway
 */
export async function startGateway(account: WeChatAccount): Promise<GatewayInstance> {
  const app: Application = express();
  const config = loadConfig();

  logger.info("正在启动 OAPlugin Gateway v3.0.0...", {
    port: account.port || 8080,
    messageMode: config.wechat?.messageMode || 'plain',
    replyMode: config.wechat?.replyMode || 'passive',
  });

  // 解析原始Body
  app.use(express.raw({ type: "text/xml", limit: "1mb" }));
  app.use(express.json());

  // ========== 1. 微信服务器验证 ==========
  app.get("/wx/webhook", (req: Request, res: Response) => {
    const { signature, timestamp, nonce, echostr } = req.query;

    logger.info("收到微信服务器验证请求", { timestamp, nonce });

    if (!verifySignature(
      account.token,
      timestamp as string,
      nonce as string,
      signature as string
    )) {
      logger.warn("微信服务器验证失败：签名不匹配");
      res.status(403).send("Forbidden");
      return;
    }

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
        logger.warn("消息签名验证失败");
        return res.status(403).send("Forbidden");
      }

      // 2. 解密消息
      let messageXML: string;
      let isEncrypted: boolean;
      const rawBody = req.body.toString();

      try {
        const result = await decryptWeChatMessage(rawBody, account);
        messageXML = result.messageXML;
        isEncrypted = result.isEncrypted;
      } catch (error: any) {
        logger.error("消息解密失败", { error: error.message });
        return res.send("success");
      }

      // 3. 解析XML
      let message: any;
      try {
        message = await parseWeChatXMLAsync(messageXML);
        logger.info("收到微信消息", {
          openid: message.FromUserName,
          msgType: message.MsgType,
          content: message.Content?.substring(0, 100),
        });
      } catch (parseError: any) {
        logger.error("XML解析失败", { error: parseError.message });
        return res.send("success");
      }

      // 4. 更新交互记录
      interactionManager.updateInteraction(message.FromUserName);

      // 5. 根据回复模式处理
      const replyMode = config.wechat?.replyMode || 'passive';

      if (replyMode === 'passive') {
        // Passive 模式：同步处理
        await handlePassiveReply(account, message, res, isEncrypted);
      } else {
        // Active 模式：异步处理
        res.send('success');
        setImmediate(async () => {
          await handleActiveDelivery(account, message);
        });
      }

    } catch (error: any) {
      logger.error("处理微信消息异常", { error: error.message });
      if (!res.headersSent) {
        res.send("success");
      }
    }
  });

  // ========== 3. 健康检查 ==========
  app.get("/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      version: "3.0.0",
      timestamp: new Date().toISOString(),
      account: account.id,
      uptime: process.uptime(),
    });
  });

  // ========== 4. 服务器状态 ==========
  app.get("/status", (req: Request, res: Response) => {
    const stats = interactionManager.getStats();
    res.json({
      status: "running",
      version: "3.0.0",
      account: account.id,
      appId: account.appId,
      port: account.port,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      interactionStats: stats,
    });
  });

  // 启动服务器
  const port = account.port || 8080;
  const server = app.listen(port, "0.0.0.0", () => {
    logger.info(`OAPlugin Gateway v3.0.0 启动成功`, { port, path: "/wx/webhook" });
  });

  server.on("error", (error: any) => {
    logger.error("Gateway服务器错误", { error: error.message });
  });

  serverInstance = server;

  return {
    server,
    dispose: async () => {
      return new Promise<void>((resolve) => {
        server.close(() => {
          logger.info("OAPlugin Gateway 已停止");
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
    logger.info("正在停止 OAPlugin Gateway...");
    serverInstance.close();
    serverInstance = null;
    logger.info("OAPlugin Gateway 已停止");
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
 * Passive 回复模式处理
 */
async function handlePassiveReply(
  account: WeChatAccount,
  message: any,
  res: Response,
  isEncrypted: boolean
): Promise<void> {
  try {
    // TODO: 调用 OpenClaw Core 处理消息
    // 临时返回测试回复
    const replyContent = `收到你的消息：${message.Content || '[空消息]'}`;

    // 构建回复 XML
    let replyXML = generatePassiveReplyXML(
      account,
      message.FromUserName,
      message.ToUserName,
      replyContent,
      "text"
    );

    // 如果需要加密
    if (isEncrypted && account.encodingAESKey) {
      const msgCrypt = new MsgCrypt(account.token, account.encodingAESKey, account.appId);
      const encrypted = msgCrypt.encrypt(replyXML);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = Math.random().toString(36).substring(2, 10);
      const signature = msgCrypt.generateSignature(timestamp, nonce, encrypted);

      replyXML = `<xml>
<Encrypt><![CDATA[${encrypted}]]></Encrypt>
<MsgSignature><![CDATA[${signature}]]></MsgSignature>
<TimeStamp>${timestamp}</TimeStamp>
<Nonce><![CDATA[${nonce}]]></Nonce>
</xml>`;
    }

    res.type('application/xml');
    res.send(replyXML);

    logger.info("Passive 回复已发送", { openid: message.FromUserName });
  } catch (error: any) {
    logger.error("Passive 回复失败", { error: error.message });
    res.send("success");
  }
}

/**
 * Active 回复模式处理
 */
async function handleActiveDelivery(account: WeChatAccount, message: any): Promise<void> {
  try {
    // TODO: 调用 OpenClaw Core 处理消息
    // 临时返回测试回复
    const replyContent = `收到你的消息：${message.Content || '[空消息]'}`;

    // 通过客服消息发送
    await sendMessage(account, { openid: message.FromUserName }, replyContent, "text");

    logger.info("Active 回复已发送", { openid: message.FromUserName });
  } catch (error: any) {
    logger.error("Active 回复失败", { error: error.message });

    // 发送兜底话术
    try {
      await sendMessage(account, { openid: message.FromUserName }, FALLBACK_MESSAGE, "text");
    } catch (fallbackError: any) {
      logger.error("兜底话术发送失败", { error: fallbackError.message });
    }
  }
}

/**
 * 发送兜底话术
 */
async function sendFallbackMessage(account: WeChatAccount, openid: string, message: string): Promise<void> {
  try {
    await sendMessage(account, { openid }, message, "text");
  } catch (error: any) {
    logger.error("兜底话术发送失败", { error: error.message, openid });
  }
}
