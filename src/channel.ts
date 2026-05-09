/**
 * OpenClaw 微信公众号插件 - 主入口 (ChannelPlugin接口)
 * 
 * 实现OpenClaw插件SDK的ChannelPlugin接口
 */

import { ChannelPlugin, Account, InboundMessage, OutboundTarget } from "openclaw/plugin-sdk";
import { WeChatAccount, WeChatConfig } from "./types";
import { loadConfig } from "./config";
import { startGateway, stopGateway } from "./gateway";
import { sendMessage } from "./outbound";
import { submitToOpenClaw } from "./inbound";

/**
 * WeChatAccount接口定义
 * 扩展自OpenClaw的Account接口
 */
export interface WeChatAccount extends Account {
  id: string;
  appId: string;
  appSecret: string;
  token: string;
  encodingAESKey: string;
  port: number;
}

/**
 * WeChat插件主对象
 * 实现ChannelPlugin接口
 */
export const wechatPlugin: ChannelPlugin<WeChatAccount> = {
  id: "wechat",
  meta: {
    id: "wechat",
    label: "WeChat Official Account",
    selectionLabel: "微信公众号",
    docsPath: "/docs/channels/wechat",
    blurb: "连接微信公众号，实现智能客服",
    logo: "wechat-logo.png",
    order: 60,
  },
  
  capabilities: {
    chatTypes: ["direct"],           // 服务号支持单聊
    media: true,                     // 支持图片/语音
    reactions: false,
    threads: false,
    blockStreaming: true,            // 不支持流式输出
    knowledgeBase: true,             // 支持知识库
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
        account?.token && 
        account?.encodingAESKey
      );
    },
    
    listAccounts: (cfg: WeChatConfig): string[] => {
      return ["default"];
    },
  },
  
  // ========== 消息发送 ==========
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
      throw new Error(`启动微信插件失败: ${error.message}`);
    }
  },
  
  stopAccount: async ({ account }: { account: WeChatAccount }) => {
    try {
      await stopGateway(account);
      return { success: true };
    } catch (error: any) {
      throw new Error(`停止微信插件失败: ${error.message}`);
    }
  },
  
  // ========== 接收消息处理 ==========
  onInbound: async ({ account, rawMessage }: { account: WeChatAccount; rawMessage: any }) => {
    // 由gateway直接调用OpenClaw核心，此函数用于格式转换
    return submitToOpenClaw(account, rawMessage);
  },
};

export default wechatPlugin;
