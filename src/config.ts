/**
 * OpenClaw 微信公众号插件 - 配置管理模块
 * 
 * 负责加载和管理插件配置
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { WeChatConfig } from "./types";

// 加载环境变量
dotenv.config({ path: path.join(__dirname, "../config/.env.wechat") });

let cachedConfig: WeChatConfig | null = null;

/**
 * 加载配置
 */
export function loadConfig(): WeChatConfig {
  if (cachedConfig) {
    return cachedConfig;
  }
  
  // 从环境变量读取敏感信息
  const config: WeChatConfig = {
    server: {
      host: process.env.SERVER_HOST || "0.0.0.0",
      port: parseInt(process.env.SERVER_PORT || "8080"),
      publicUrl: process.env.SERVER_PUBLIC_URL || "",
    },
    wechat: {
      appId: process.env.WECHAT_APP_ID || "",
      appSecret: process.env.WECHAT_APP_SECRET || "",
      token: process.env.WECHAT_TOKEN || "",
      encodingAESKey: process.env.WECHAT_ENCODING_AES_KEY || "",
    },
    openclaw: {
      knowledgeBaseId: process.env.OPENCLAW_KNOWLEDGE_BASE_ID || "",
      apiTimeout: parseInt(process.env.OPENCLAW_API_TIMEOUT || "10000"),
    },
  };
  
  // 验证配置
  validateConfig(config);
  
  cachedConfig = config;
  return config;
}

/**
 * 验证配置
 */
function validateConfig(config: WeChatConfig): void {
  const errors: string[] = [];
  
  // 验证必填项
  if (!config.wechat.appId) errors.push("wechat.appId 不能为空");
  if (!config.wechat.appSecret) errors.push("wechat.appSecret 不能为空");
  if (!config.wechat.token) errors.push("wechat.token 不能为空");
  if (!config.wechat.encodingAESKey) errors.push("wechat.encodingAESKey 不能为空");
  if (config.wechat.encodingAESKey.length !== 43) errors.push("wechat.encodingAESKey 必须是43位");
  
  if (!config.openclaw.knowledgeBaseId) errors.push("openclaw.knowledgeBaseId 不能为空");
  
  if (errors.length > 0) {
    throw new Error(`配置验证失败:\n${errors.join("\n")}`);
  }
}

/**
 * 清除缓存 (用于配置更新后重新加载)
 */
export function reloadConfig(): void {
  cachedConfig = null;
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(): string {
  return path.join(__dirname, "../config/wechat-config.json");
}

/**
 * 获取环境变量文件路径
 */
export function getEnvPath(): string {
  return path.join(__dirname, "../config/.env.wechat");
}
