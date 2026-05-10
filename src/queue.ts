/**
 * 消息队列模块
 * 
 * 提供基于内存的消息队列，用于 OpenClaw 主动推送消息到 OAGateway
 * 然后 OAGateway 调用微信客服接口发送给用户
 */

import logger from "./utils/logger";

// 消息队列项
interface QueueItem {
  id: string;
  openid: string;
  content: string;
  msgType: string;
  createTime: number;
  status: "pending" | "processing" | "completed" | "failed";
}

// 内存队列
const messageQueue: QueueItem[] = [];

// 队列配置
let maxQueueSize = 1000;
let defaultTtlMs = 5 * 60 * 1000; // 5分钟过期

/**
 * 初始化消息队列
 */
export function initQueue(config?: { maxSize?: number; ttlMs?: number }) {
  if (config?.maxSize) maxQueueSize = config.maxSize;
  if (config?.ttlMs) defaultTtlMs = config.ttlMs;
  logger.info("消息队列初始化", { maxQueueSize, defaultTtlMs });
}

/**
 * 添加消息到队列
 */
export function enqueue(params: {
  openid: string;
  content: string;
  msgType?: string;
}): QueueItem {
  const { openid, content, msgType = "text" } = params;
  
  // 队列满时移除最旧的消息
  if (messageQueue.length >= maxQueueSize) {
    const removed = messageQueue.shift();
    logger.warn("队列已满，移除旧消息", { removedId: removed?.id });
  }
  
  const item: QueueItem = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    openid,
    content,
    msgType,
    createTime: Date.now(),
    status: "pending",
  };
  
  messageQueue.push(item);
  logger.info("消息入队", { id: item.id, openid, msgType });
  return item;
}

/**
 * 获取待处理的消息列表
 */
export function getPendingMessages(): QueueItem[] {
  const now = Date.now();
  return messageQueue.filter(
    (item) => item.status === "pending" && now - item.createTime < defaultTtlMs
  );
}

/**
 * 获取队列状态
 */
export function getQueueStatus() {
  const pending = messageQueue.filter((item) => item.status === "pending").length;
  const processing = messageQueue.filter((item) => item.status === "processing").length;
  const completed = messageQueue.filter((item) => item.status === "completed").length;
  const failed = messageQueue.filter((item) => item.status === "failed").length;
  
  return {
    total: messageQueue.length,
    pending,
    processing,
    completed,
    failed,
    maxSize: maxQueueSize,
  };
}

/**
 * 更新消息状态
 */
export function updateStatus(id: string, status: QueueItem["status"]): boolean {
  const item = messageQueue.find((item) => item.id === id);
  if (!item) return false;
  
  item.status = status;
  logger.debug("消息状态更新", { id, status });
  return true;
}

/**
 * 清理过期/已完成的消息
 */
export function cleanupQueue(): number {
  const now = Date.now();
  const before = messageQueue.length;
  
  // 移除已完成/失败且过期的消息
  for (let i = messageQueue.length - 1; i >= 0; i--) {
    const item = messageQueue[i];
    const isExpired = now - item.createTime > defaultTtlMs;
    const isDone = item.status === "completed" || item.status === "failed";
    
    if ((isDone && isExpired) || (isExpired && item.status === "pending")) {
      messageQueue.splice(i, 1);
    }
  }
  
  const removed = before - messageQueue.length;
  if (removed > 0) {
    logger.info("队列清理完成", { removed, remaining: messageQueue.length });
  }
  return removed;
}

/**
 * 获取队列中的消息（用于 API 返回）
 */
export function getQueueItems(): QueueItem[] {
  return [...messageQueue];
}
