/**
 * OpenClaw 微信公众号插件 - Plugin 主入口
 * 
 * 实现 ChannelPlugin 接口，接收来自 WeChat Gateway 的消息
 * 并通过 OpenClaw AI 处理，然后返回回复
 */

import express, { Application, Request, Response } from "express";
import { WeChatAccount } from "./types";
import { loadConfig } from "./config";
import { convertToOpenClawFormat } from "./inbound";
import logger from "./utils/logger";

let pluginServer: any = null;
let cfg: any = null;

/**
 * OpenClaw 微信公众号插件
 * 注意：使用 any 类型避免 openclaw/plugin-sdk 依赖问题
 * 安装到 OpenClaw 时，SDK 会自动可用
 */
export const wechatPlugin: any = {
  id: "openclaw-wechatOA",  
  
  meta: {
    id: "openclaw-wechatOA",
    label: "WeChat Official Account",
    selectionLabel: "WeChat OA",
    docsPath: "/docs/channels/openclaw-wechatOA",
    blurb: "Connect to WeChat Official Account via Gateway",
    order: 60,
  },  
  
  capabilities: {
    chatTypes: ["direct"],
    media: true,
    reactions: false,
    threads: false,
    blockStreaming: true,
  },
  
  // ========== 账户管理 ==========
  accounts: {
    resolveAccount: (config: any, accountId: string) => {
      cfg = config;
      return {
        id: accountId || "default",
        appId: config.wechat?.appId || "",
        appSecret: config.wechat?.appSecret || "",
        token: config.wechat?.token || "",
        encodingAESKey: config.wechat?.encodingAESKey || "",
        port: config.server?.port || 8080,
      } as WeChatAccount;
    },
    
    defaultAccountId: (config: any) => {
      return config.wechat?.appId ? "default" : undefined;
    },
    
    isConfigured: (account: WeChatAccount) => {
      return Boolean(account?.appId && account?.token);
    },
  },
  
  // ========== 启动账户（启动 webhook 接收器）==========
  startAccount: async ({ account }: any) => {
    const app: Application = express();
    const config = loadConfig();
    
    // 从配置读取 webhook 端口（插件自己监听的端口）
    const webhookPort = parseInt(
      process.env.PLUGIN_WEBHOOK_PORT || 
      process.env.PORT || 
      "3000"
    );
    
    logger.info("正在启动 OpenClaw Plugin webhook 接收器...", { 
      port: webhookPort,
      gatewayUrl: config.plugin?.webhookUrl 
    });
    
    app.use(express.json());
    
    // ========== 接收来自 WeChat Gateway 的消息 ==========
    app.post("/wechat/message", async (req: Request, res: Response) => {
      try {
        // 1. 验证认证 token
        const authHeader = req.headers.authorization;
        const expectedToken = config.plugin?.authToken || "default-test-token-2026";
        
        if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
          logger.warn("Webhook 认证失败");
          return res.status(401).json({ error: "Unauthorized" });
        }
        
        const { message, account: msgAccount } = req.body;
        
        logger.info("收到 WeChat Gateway 推送的消息", {
          openid: message?.fromUserName,
          msgType: message?.msgType,
        });
        
        // 2. 转换消息为 OpenClaw 格式
        const openclawRequest = convertToOpenClawFormat(
          { id: msgAccount?.id || "default" } as WeChatAccount,
          message
        );
        
        // 3. 调用 OpenClaw AI 处理
        const reply = await processWithOpenClaw(openclawRequest, config);
        
        // 4. 发送回复到 WeChat Gateway
        const gatewayReplyUrl = `http://${config.server?.host || "43.164.1.25"}:${config.server?.port || 8080}/wx/reply`;
        
        const replyResponse = await fetch(gatewayReplyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${expectedToken}`,
          },
          body: JSON.stringify({
            openid: message.fromUserName,
            content: reply,
            msgType: "text",
          }),
          signal: AbortSignal.timeout(5000),
        });
        
        if (!replyResponse.ok) {
          throw new Error(`发送回复到 Gateway 失败: ${replyResponse.status}`);
        }
        
        logger.info("回复已发送到 Gateway", { openid: message.fromUserName });
        
        // 5. 返回成功给 Gateway
        res.json({ success: true });
      } catch (error: any) {
        logger.error("处理 webhook 消息失败", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });
    
    // ========== 健康检查 ==========
    app.get("/health", (req: Request, res: Response) => {
      res.json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        plugin: "openclaw-wechatOA",
      });
    });
    
    // 启动 webhook 服务器
    const server = app.listen(webhookPort, "0.0.0.0", () => {
      logger.info(`OpenClaw Plugin webhook 接收器启动成功`, { 
        port: webhookPort,
        webhookPath: "/wechat/message" 
      });
    });
    
    pluginServer = server;
    
    return {
      dispose: async () => {
        return new Promise<void>((resolve) => {
          if (pluginServer) {
            pluginServer.close(() => {
              logger.info("OpenClaw Plugin webhook 接收器已停止");
              pluginServer = null;
              resolve();
            });
          } else {
            resolve();
          }
        });
      },
    };
  },
  
  // ========== 停止账户 ==========
  stopAccount: async ({ account }: any) => {
    if (pluginServer) {
      logger.info("正在停止 OpenClaw Plugin...");
      pluginServer.close();
      pluginServer = null;
    }
  },
  
  // ========== 发送消息（通过 Gateway）==========
  deliver: async ({ account, target, content }: any) => {
    const config = loadConfig();
    const expectedToken = config.plugin?.authToken || "default-test-token-2026";
    const gatewayReplyUrl = `http://${config.server?.host || "43.164.1.25"}:${config.server?.port || 8080}/wx/reply`;
    
    logger.info("Plugin.deliver 被调用", { target, contentLength: content?.length });
    
    try {
      const response = await fetch(gatewayReplyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${expectedToken}`,
        },
        body: JSON.stringify({
          openid: target.openid || target.userId,
          content: content,
          msgType: "text",
        }),
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) {
        throw new Error(`deliver: 发送失败 ${response.status}`);
      }
      
      logger.info("deliver: 回复已发送", { target });
    } catch (error: any) {
      logger.error("deliver: 发送失败", { error: error.message });
      throw error;
    }
  },
};

/**
 * 调用 OpenClaw AI 处理消息
 */
async function processWithOpenClaw(request: any, config: any): Promise<string> {
  try {
    // TODO: 根据实际 OpenClaw Plugin SDK 的 API 来调用
    // 这里暂时返回一个测试回复
    
    const isTestMode = !config.openclaw?.apiUrl || 
                      config.openclaw.apiUrl === "https://api.openclaw.ai" ||
                      config.openclaw.apiUrl?.includes("your-openclaw-domain.com");
    
    if (isTestMode) {
      // 测试模式：echo 回复
      return `🤖 OpenClaw Plugin 测试模式\n\n您说：${request.message}\n\n（这是 Plugin 的测试回复）`;
    }
    
    // 实际模式：调用 OpenClaw API
    const baseUrl = config.openclaw.apiUrl.replace(/\/$/, '');
    const apiUrl = `${baseUrl}/api/chat`;
    
    logger.info("调用 OpenClaw API", { apiUrl });
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: request.message,
        userId: request.userId,
        sessionId: request.sessionId,
        knowledgeBaseId: request.knowledgeBaseId,
      }),
      signal: AbortSignal.timeout(config.openclaw?.apiTimeout || 10000),
    });
    
    if (!response.ok) {
      throw new Error(`OpenClaw API 调用失败: ${response.status}`);
    }
    
    const result: any = await response.json();
    return result.reply || result.content || "抱歉，我暂时无法处理您的请求。";
  } catch (error: any) {
    logger.error("OpenClaw AI 处理失败", { error: error.message });
    return "抱歉，系统暂时无法处理您的请求，请稍后再试。";
  }
}

export default wechatPlugin;
