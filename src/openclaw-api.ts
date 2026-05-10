/**
 * OpenClaw QA Bus API 封装
 * 
 * 提供 injectQaBusInboundMessage 和 pollQaBus 的简化调用
 */

import logger from "./utils/logger";

// OpenClaw 配置
let baseUrl = "http://127.0.0.1:25265";
let accountId = "a366989004a7-im-bot";

/**
 * 初始化 OpenClaw API
 */
export function initOpenClawAPI(config: { baseUrl: string; accountId: string }) {
  baseUrl = config.baseUrl.replace(/\/$/, '');
  accountId = config.accountId;
  logger.info("OpenClaw API 初始化", { baseUrl, accountId });
}

/**
 * 注入消息到 OpenClaw QA Bus
 */
export async function injectMessage(params: {
  conversationId: string;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp?: number;
}): Promise<any> {
  const { conversationId, senderId, senderName, text, timestamp = Date.now() } = params;
  
  const input = {
    accountId,
    conversation: {
      id: conversationId,
      kind: "direct" as const,
      title: `微信用户 ${senderId}`,
    },
    senderId,
    senderName: senderName || `微信用户 ${senderId}`,
    text,
    timestamp,
  };
  
  logger.debug("注入消息到 OpenClaw", { conversationId, senderId, text: text.substring(0, 50) });
  
  try {
    const response = await fetch(`${baseUrl}/api/qa-bus/inject-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    
    if (!response.ok) {
      throw new Error(`OpenClaw API 错误: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json() as any;
    logger.info("消息注入成功", { messageId: result.message?.id });
    return result;
  } catch (error: any) {
    logger.error("消息注入失败", { error: error.message, conversationId, senderId });
    throw error;
  }
}

/**
 * 轮询 OpenClaw QA Bus 获取回复
 */
export async function pollReplies(params: {
  cursor?: number;
  timeoutMs?: number;
}): Promise<any> {
  const { cursor = 0, timeoutMs = 30000 } = params;
  
  logger.debug("轮询 OpenClaw 回复", { cursor, timeoutMs });
  
  try {
    const response = await fetch(`${baseUrl}/api/qa-bus/poll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accountId,
        cursor,
        timeoutMs,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenClaw API 错误: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json() as any;
    logger.debug("轮询结果", { eventCount: result.events?.length || 0, newCursor: result.cursor });
    return result;
  } catch (error: any) {
    logger.error("轮询失败", { error: error.message });
    throw error;
  }
}

/**
 * 发送回复给用户
 */
export async function sendReply(params: {
  openid: string;
  content: string;
  msgType?: string;
}): Promise<any> {
  // 这里应该调用微信公众号客服接口发送消息
  // 暂时返回成功，实际实现需要调用微信 API
  logger.info("发送回复", { openid: params.openid, content: params.content.substring(0, 50) });
  return { success: true };
}
