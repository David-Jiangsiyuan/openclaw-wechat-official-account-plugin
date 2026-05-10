/**
 * OAPlugin v2.0 - OpenClaw 标准扩展插件
 * 
 * 实现 ChannelPlugin 接口，与 OpenClaw Core 集成
 */

import { WeChatAccount, WeChatConfig } from "./types";
import { loadConfig } from "./config";
import { startGateway, stopGateway } from "./gateway";
import { sendMessage } from "./outbound";
import { submitToOpenClaw } from "./inbound";

// 简化类型定义，避免依赖 OpenClaw SDK
type OutboundTarget = any;
type InboundMessage = any;

/**
 * OAPlugin 主对象
 * 实现 ChannelPlugin 接口
 */
export const openclawWechatOAPlugin = {
  id: "openclaw-wechatOA",
  
  meta: {
    id: "openclaw-wechatOA",
    label: "WeChat Official Account",
    selectionLabel: "微信公众号",
    docsPath: "/docs/channels/openclaw-wechatOA",
    blurb: "连接微信公众号，实现智能客服",
    logo: "wechat-logo.png",
    order: 60,
  },
  
  capabilities: {
    chatTypes: ["direct"],
    media: true,
    reactions: false,
    threads: false,
    blockStreaming: true,
    knowledgeBase: true,
  },
  
  // ========== 账户管理 ==========
  accounts: {
    resolveAccount: (cfg: WeChatConfig, accountId: string): WeChatAccount | null => {
      const config = cfg.wechat;
      if (!config) return null;
      
      return {
        id: accountId || "default",
        appId: config.appId,
        appSecret: config.appSecret,
        token: config.token,
        encodingAESKey: config.encodingAESKey,
        port: cfg.server.port,
      };
    },
    
    defaultAccountId: (cfg: WeChatConfig): string => {
      return "default";
    },
    
    isConfigured: (account: WeChatAccount): boolean => {
      return Boolean(
        account?.appId && 
        account?.appSecret && 
        account?.token
      );
    },
    
    listAccounts: (cfg: WeChatConfig): string[] => {
      return ["default"];
    },
  },
  
  // ========== 消息发送（通过 OAGateway）==========
  deliver: async ({ 
    account, 
    target, 
    content,
    messageType = "text",
  }: {
    account: WeChatAccount;
    target: OutboundTarget;
    content: string;
    messageType?: string;
  }) => {
    try {
      const result = await sendMessage(account, target, content, messageType);
      return { success: true, messageId: result.messageId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
  
  // ========== 生命周期管理 ==========
  startAccount: async ({ account }: { account: WeChatAccount }) => {
    try {
      const gateway = await startGateway(account);
      return { success: true, gateway };
    } catch (error: any) {
      throw new Error(`启动 OAPlugin 失败: ${error.message}`);
    }
  },
  
  stopAccount: async ({ account }: { account: WeChatAccount }) => {
    try {
      await stopGateway(account);
      return { success: true };
    } catch (error: any) {
      throw new Error(`停止 OAPlugin 失败: ${error.message}`);
    }
  },
  
  // ========== 接收消息处理（从 OAGateway 转发）==========
  onInbound: async ({ account, rawMessage }: { account: WeChatAccount; rawMessage: any }) => {
    return submitToOpenClaw(account, rawMessage);
  },
};

export default openclawWechatOAPlugin;
