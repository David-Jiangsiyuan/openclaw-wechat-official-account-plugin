/**
 * OpenClaw 微信公众号插件 - 独立启动入口
 * 
 * 用于独立部署（不依赖OpenClaw核心）
 */

import { loadConfig } from "./config";
import { startGateway, getGatewayStatus } from "./gateway";
import { WeChatAccount } from "./types";
import logger from "./utils/logger";

async function main() {
  try {
    logger.info("正在启动 OpenClaw 微信公众号插件...");
    
    // 1. 加载配置
    const config = loadConfig();
    
    // 2. 构建账户对象
    const account: WeChatAccount = {
      id: "default",
      appId: config.wechat.appId,
      appSecret: config.wechat.appSecret,
      token: config.wechat.token,
      encodingAESKey: config.wechat.encodingAESKey,
      port: config.server.port,
    };
    
    // 3. 启动Gateway (HTTP服务器)
    const gateway = await startGateway(account);
    
    logger.info("OpenClaw 微信公众号插件启动成功", {
      appId: account.appId,
      port: config.server.port,
      webhookPath: "/wx/webhook",
      publicUrl: `http://43.164.1.25/wx/webhook`,
    });
    
    // 4. 保持进程运行 (处理退出信号)
    process.on("SIGINT", async () => {
      logger.info("收到 SIGINT 信号，正在关闭...");
      await gateway.dispose();
      process.exit(0);
    });
    
    process.on("SIGTERM", async () => {
      logger.info("收到 SIGTERM 信号，正在关闭...");
      await gateway.dispose();
      process.exit(0);
    });
    
  } catch (error: any) {
    logger.error("启动失败", { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

main();
