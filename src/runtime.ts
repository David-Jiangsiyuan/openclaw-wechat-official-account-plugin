/**
 * OpenClaw 微信公众号插件 - Runtime 模块
 * 
 * 运行时管理
 */

import { WeChatAccount } from "./types";
import { startGateway, stopGateway } from "./gateway";
import { loadConfig } from "./config";

let activeGateways: Map<string, any> = new Map();

/**
 * 启动插件
 */
export async function startPlugin(account: WeChatAccount): Promise<void> {
  try {
    console.log("启动微信插件...", { accountId: account.id });
    
    // 1. 加载配置
    const config = loadConfig();
    console.log("配置加载成功");
    
    // 2. 启动Gateway
    const gateway = await startGateway(account);
    activeGateways.set(account.id, gateway);
    
    console.log("微信插件启动成功");
  } catch (error: any) {
    console.error("微信插件启动失败", { error: error.message });
    throw error;
  }
}

/**
 * 停止插件
 */
export async function stopPlugin(account: WeChatAccount): Promise<void> {
  try {
    console.log("停止微信插件...", { accountId: account.id });
    
    // 停止Gateway
    const gateway = activeGateways.get(account.id);
    if (gateway) {
      await gateway.dispose();
      activeGateways.delete(account.id);
    }
    
    console.log("微信插件已停止");
  } catch (error: any) {
    console.error("微信插件停止失败", { error: error.message });
    throw error;
  }
}

/**
 * 健康检查
 */
export function healthCheck(): { status: string; details: any } {
  return {
    status: activeGateways.size > 0 ? "running" : "stopped",
    details: {
      activeGateways: Array.from(activeGateways.keys()),
      timestamp: new Date().toISOString(),
    },
  };
}
