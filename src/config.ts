/**
 * OpenClaw 微信公众号插件 - 配置管理模块
 * 
 * 负责加载和管理插件配置
 * 支持：JSON配置文件、环境变量、配置热重载、敏感信息脱敏
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { WeChatConfig } from "./types";
import { logger } from "./utils/logger";

// 加载环境变量
dotenv.config({ path: path.join(__dirname, "../config/.env.wechat") });

let cachedConfig: WeChatConfig | null = null;
let configFilePath: string = "";
let envFilePath: string = "";
let watcher: fs.FSWatcher | null = null;

/**
 * 加载配置 (支持JSON文件和环境变量)
 */
export function loadConfig(forceReload: boolean = false): WeChatConfig {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }
  
  try {
    logger.info("正在加载配置...");
    
    // 1. 从环境变量读取配置
    let config: WeChatConfig = loadFromEnv();
    
    // 2. 尝试从JSON配置文件读取 (覆盖环境变量)
    config = loadFromJSON(config);
    
    // 3. 验证配置
    validateConfig(config);
    
    // 4. 脱敏处理 (用于日志)
    const maskedConfig = maskSensitiveInfo(config);
    logger.info("配置加载成功", maskedConfig);
    
    // 5. 缓存配置
    cachedConfig = config;
    
    // 6. 启动配置文件监听 (热重载)
    startConfigWatcher();
    
    return config;
  } catch (error: any) {
    logger.error("配置加载失败", { error: error.message });
    
    // 友好的错误提示
    if (error.message.includes("ENOENT")) {
      const configPath = path.join(__dirname, "../config/wechat-config.json");
      const envPath = path.join(__dirname, "../config/.env.wechat");
      
      throw new Error(
        `配置文件未找到！\n\n` +
        `请执行以下步骤：\n` +
        `1. 复制配置模板：\n` +
        `   cp config/wechat-config.template.json config/wechat-config.json\n` +
        `   cp config/.env.wechat.template config/.env.wechat\n\n` +
        `2. 编辑配置文件，填写实际值：\n` +
        `   - config/wechat-config.json\n` +
        `   - config/.env.wechat\n\n` +
        `3. 重启插件\n\n` +
        `配置文件路径：\n` +
        `   - ${configPath}\n` +
        `   - ${envPath}`
      );
    }
    
    throw error;
  }
}

/**
 * 从环境变量加载配置
 */
function loadFromEnv(): WeChatConfig {
  return {
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
      apiUrl: process.env.OPENCLAW_API_URL || "https://api.openclaw.ai",
      knowledgeBaseId: process.env.OPENCLAW_KNOWLEDGE_BASE_ID || "",
      apiTimeout: parseInt(process.env.OPENCLAW_API_TIMEOUT || "10000"),
    },
  };
}

/**
 * 从JSON文件加载配置 (可选)
 */
function loadFromJSON(config: WeChatConfig): WeChatConfig {
  configFilePath = path.join(__dirname, "../config/wechat-config.json");
  
  if (!fs.existsSync(configFilePath)) {
    logger.warn("JSON配置文件不存在，仅使用环境变量", { path: configFilePath });
    return config;
  }
  
  try {
    const fileContent = fs.readFileSync(configFilePath, "utf-8");
    const jsonConfig = JSON.parse(fileContent);
    
    // 深度合并配置 (环境变量优先)
    if (jsonConfig.server) {
      config.server = { ...config.server, ...jsonConfig.server };
    }
    if (jsonConfig.wechat) {
      config.wechat = { ...config.wechat, ...jsonConfig.wechat };
    }
    if (jsonConfig.openclaw) {
      config.openclaw = { ...config.openclaw, ...jsonConfig.openclaw };
    }
    
    logger.info("JSON配置文件加载成功", { path: configFilePath });
  } catch (error: any) {
    logger.error("JSON配置文件解析失败", { error: error.message, path: configFilePath });
  }
  
  return config;
}

/**
 * 验证配置
 */
function validateConfig(config: WeChatConfig): void {
  const errors: string[] = [];
  
  // 验证必填项
  if (!config.wechat.appId) {
    errors.push("wechat.appId 不能为空 (请配置 WECHAT_APP_ID 环境变量或 wechat-config.json)");
  }
  if (!config.wechat.appSecret) {
    errors.push("wechat.appSecret 不能为空 (请配置 WECHAT_APP_SECRET 环境变量或 wechat-config.json)");
  }
  if (!config.wechat.token) {
    errors.push("wechat.token 不能为空 (请配置 WECHAT_TOKEN 环境变量或 wechat-config.json)");
  }
  // encodingAESKey 可选 (微信测试账号不支持加密)
  // 如果配置了，则验证格式
  if (config.wechat.encodingAESKey && config.wechat.encodingAESKey.length !== 43) {
    errors.push(`wechat.encodingAESKey 必须是43位，当前为 ${config.wechat.encodingAESKey.length} 位`);
  }
  
  if (config.server.port && (config.server.port < 1 || config.server.port > 65535)) {
    errors.push(`server.port 必须在 1-65535 之间，当前为 ${config.server.port}`);
  }
  
  if (config.openclaw.apiTimeout && config.openclaw.apiTimeout < 1000) {
    errors.push(`openclaw.apiTimeout 必须 >= 1000ms，当前为 ${config.openclaw.apiTimeout}ms`);
  }
  
  if (errors.length > 0) {
    throw new Error(`配置验证失败:\n${errors.join("\n")}`);
  }
}

/**
 * 脱敏敏感信息 (用于日志)
 */
function maskSensitiveInfo(config: WeChatConfig): any {
  const masked = JSON.parse(JSON.stringify(config));
  
  // 脱敏 appSecret
  if (masked.wechat.appSecret) {
    masked.wechat.appSecret = maskString(masked.wechat.appSecret);
  }
  
  // 脱敏 encodingAESKey
  if (masked.wechat.encodingAESKey) {
    masked.wechat.encodingAESKey = maskString(masked.wechat.encodingAESKey);
  }
  
  return masked;
}

/**
 * 字符串脱敏 (保留前4位和后4位)
 */
function maskString(str: string): string {
  if (str.length <= 8) {
    return "*".repeat(str.length);
  }
  return str.substring(0, 4) + "*".repeat(str.length - 8) + str.substring(str.length - 4);
}

/**
 * 启动配置文件监听 (热重载)
 */
function startConfigWatcher(): void {
  if (watcher) {
    watcher.close();
  }
  
  const configDir = path.join(__dirname, "../config");
  
  try {
    watcher = fs.watch(configDir, (eventType, filename) => {
      if (filename && (filename.endsWith(".json") || filename.endsWith(".env.wechat"))) {
        logger.info("检测到配置文件变更，准备重载...", { eventType, filename });
        
        // 延迟重载 (避免文件写入中读取)
        setTimeout(() => {
          try {
            reloadConfig();
            logger.info("配置热重载成功");
          } catch (error: any) {
            logger.error("配置热重载失败", { error: error.message });
          }
        }, 1000);
      }
    });
    
    logger.info("配置热重载已启动", { watchDir: configDir });
  } catch (error: any) {
    logger.warn("无法启动配置热重载", { error: error.message });
  }
}

/**
 * 清除缓存并重新加载配置 (用于配置更新后)
 */
export function reloadConfig(): WeChatConfig {
  logger.info("正在重载配置...");
  cachedConfig = null;
  return loadConfig(true);
}

/**
 * 生成配置文件模板
 */
export function generateConfigTemplate(): void {
  const configDir = path.join(__dirname, "../config");
  
  // 生成 wechat-config.json 模板
  const configTemplate = {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    server: {
      host: "0.0.0.0",
      port: 8080,
      publicUrl: "https://your-domain.com/wx/webhook"
    },
    wechat: {
      appId: "YOUR_WECHAT_APP_ID",
      appSecret: "YOUR_WECHAT_APP_SECRET",
      token: "openclaw2026",
      encodingAESKey: "YOUR_43_CHAR_ENCODING_AES_KEY"
    },
    openclaw: {
      knowledgeBaseId: "kb-wechat-products",
      apiTimeout: 10000
    }
  };
  
  const configPath = path.join(configDir, "wechat-config.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(configTemplate, null, 2), "utf-8");
    logger.info("生成配置文件模板", { path: configPath });
  }
  
  // 生成 .env.wechat 模板
  const envTemplate = `# OpenClaw 微信公众号插件 - 环境变量配置模板
# 复制此文件为 .env.wechat 并填写实际值

# 服务器配置
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
SERVER_PUBLIC_URL=https://your-domain.com/wx/webhook

# 微信公众号配置
WECHAT_APP_ID=YOUR_WECHAT_APP_ID
WECHAT_APP_SECRET=YOUR_WECHAT_APP_SECRET
WECHAT_TOKEN=YOUR_TOKEN_HERE
WECHAT_ENCODING_AES_KEY=YOUR_43_CHAR_KEY_HERE

# OpenClaw 配置
OPENCLAW_KNOWLEDGE_BASE_ID=kb-wechat-products
OPENCLAW_API_TIMEOUT=10000
`;
  
  const envPath = path.join(configDir, ".env.wechat");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, envTemplate, "utf-8");
    logger.info("生成环境变量模板", { path: envPath });
  }
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

/**
 * 停止配置监听器
 */
export function stopConfigWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    logger.info("配置热重载已停止");
  }
}

/**
 * 验证配置文件是否存在
 */
export function validateConfigFiles(): { configExists: boolean; envExists: boolean } {
  const configPath = getConfigPath();
  const envPath = getEnvPath();
  
  return {
    configExists: fs.existsSync(configPath),
    envExists: fs.existsSync(envPath),
  };
}
