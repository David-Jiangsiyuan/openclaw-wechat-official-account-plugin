/**
 * OAPlugin v3.0.0 - 48小时交互窗口管理
 *
 * 微信公众号限制：仅能在用户最后一条消息后的 48 小时内主动发送消息
 */

import logger from "./utils/logger";

interface UserInteractionRecord {
  openid: string;
  lastInteractAt: number;
  interactCount: number;
}

export class InteractionWindowManager {
  private records: Map<string, UserInteractionRecord> = new Map();
  private readonly WINDOW_MS = 48 * 3600 * 1000; // 48小时

  /**
   * 更新用户交互记录（用户发送消息时调用）
   */
  updateInteraction(openid: string): void {
    const now = Date.now();
    const record = this.records.get(openid);

    if (record && now - record.lastInteractAt < this.WINDOW_MS) {
      // 在窗口期内，更新记录
      record.interactCount++;
      record.lastInteractAt = now;
      logger.debug("更新用户交互记录", { openid, count: record.interactCount });
    } else {
      // 新记录或窗口已过期
      this.records.set(openid, {
        openid,
        lastInteractAt: now,
        interactCount: 1,
      });
      logger.info("新建用户交互记录", { openid });
    }
  }

  /**
   * 检查是否可以在 48 小时窗口内发送消息
   */
  canSendMessage(openid: string): boolean {
    const record = this.records.get(openid);
    if (!record) return false;

    const canSend = Date.now() - record.lastInteractAt < this.WINDOW_MS;

    if (!canSend) {
      logger.warn("用户交互窗口已过期", {
        openid,
        lastInteract: new Date(record.lastInteractAt).toISOString(),
      });
    }

    return canSend;
  }

  /**
   * 获取用户交互信息
   */
  getUserInfo(openid: string): UserInteractionRecord | null {
    return this.records.get(openid) || null;
  }

  /**
   * 获取窗口剩余时间（毫秒）
   */
  getRemainingTime(openid: string): number {
    const record = this.records.get(openid);
    if (!record) return 0;

    const remaining = this.WINDOW_MS - (Date.now() - record.lastInteractAt);
    return Math.max(0, remaining);
  }

  /**
   * 清理过期记录
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [openid, record] of this.records.entries()) {
      if (now - record.lastInteractAt >= this.WINDOW_MS) {
        this.records.delete(openid);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info("清理过期交互记录", { cleaned, remaining: this.records.size });
    }
  }

  /**
   * 获取所有活跃用户
   */
  getActiveUsers(): string[] {
    const now = Date.now();
    return Array.from(this.records.entries())
      .filter(([, record]) => now - record.lastInteractAt < this.WINDOW_MS)
      .map(([openid]) => openid);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalUsers: number;
    activeUsers: number;
    expiredUsers: number;
  } {
    const now = Date.now();
    let active = 0;
    let expired = 0;

    for (const [, record] of this.records.entries()) {
      if (now - record.lastInteractAt < this.WINDOW_MS) {
        active++;
      } else {
        expired++;
      }
    }

    return {
      totalUsers: this.records.size,
      activeUsers: active,
      expiredUsers: expired,
    };
  }
}

// 单例实例
export const interactionManager = new InteractionWindowManager();
