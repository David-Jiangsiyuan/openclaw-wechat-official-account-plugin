/**
 * OpenClaw 微信公众号插件 - 类型定义
 * 
 * 定义插件所需的所有TypeScript类型
 */


// @ts-ignore
import { Account } from "openclaw/plugin-sdk";

/**
 * 微信公众号账户接口
 * 扩展自 OpenClaw 的 Account 接口
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
 * 微信配置文件接口
 */
export interface WeChatConfig {
  server: {
    host: string;
    port: number;
    publicUrl: string;
  };
  wechat: {
    appId: string;
    appSecret: string;
    token: string;
    encodingAESKey: string;
  };
  openclaw: {
    apiUrl: string;
    knowledgeBaseId: string;
    apiTimeout: number;
  };
  plugin?: {
    webhookUrl: string;
    authToken: string;
  };
}

/**
 * 微信消息结构 (XML解析后的格式)
 */
export interface WeChatInboundMessage {
  ToUserName: string;
  FromUserName: string;
  CreateTime: string;
  MsgType: string;
  Content?: string;
  MsgId?: string;
  MediaId?: string;
  MediaUrl?: string;
  Format?: string;
  Recognition?: string;
  ThumbMediaId?: string;
  Location_X?: string;
  Location_Y?: string;
  Scale?: string;
  Label?: string;
  Title?: string;
  Description?: string;
  Url?: string;
  Event?: string;
  EventKey?: string;
}

/**
 * OpenClaw 入站请求格式
 */
export interface OpenClawInboundRequest {
  userId: string;
  message: string;
  messageType: string;
  mediaUrl?: string;
  knowledgeBaseId: string;
  sessionId: string;
  metadata?: Record<string, any>;
}

/**
 * OpenClaw 响应格式
 */
export interface OpenClawResponse {
  reply?: string;
  content?: string;
  messageId?: string;
  [key: string]: any;
}

/**
 * 微信API响应格式
 */
export interface WeChatAPIResponse {
  errcode: number;
  errmsg: string;
  msgid?: string;
  access_token?: string;
  expires_in?: number;
}

/**
 * 签名验证参数
 */
export interface SignatureParams {
  token: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

/**
 * Gateway 启动返回值
 */
export interface GatewayInstance {
  server: any;
  dispose: () => Promise<void>;
}
