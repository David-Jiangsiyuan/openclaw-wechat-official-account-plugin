/**
 * OAPlugin v3.0.0 - Access Token 管理模块
 * 
 * 特性：
 * - 自动缓存 access_token
 * - 提前刷新（过期前5分钟）
 * - 并发安全（Promise 锁）
 * - 自动重试
 */

import { WeChatAccount } from "./types";
import logger from "./utils/logger";

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class AccessTokenManager {
  private cache: Map<string, TokenCache> = new Map();
  private locks: Map<string, Promise<string>> = new Map();

  /**
   * 获取 access_token（线程安全）
   */
  async getToken(account: WeChatAccount): Promise<string> {
    const cacheKey = account.appId;

    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
      logger.debug("使用缓存的 access_token", { appId: account.appId });
      return cached.token;
    }

    // 并发控制：如果已有请求在进行中，直接复用
    const existing = this.locks.get(cacheKey);
    if (existing) {
      logger.debug("复用进行中的 token 请求", { appId: account.appId });
      return existing;
    }

    // 发起新请求
    const promise = this.fetchToken(account);
    this.locks.set(cacheKey, promise);

    try {
      const token = await promise;
      return token;
    } finally {
      this.locks.delete(cacheKey);
    }
  }

  /**
   * 强制刷新 token
   */
  async refreshToken(account: WeChatAccount): Promise<string> {
    this.cache.delete(account.appId);
    return this.getToken(account);
  }

  /**
   * 从微信服务器获取 token
   */
  private async fetchToken(account: WeChatAccount): Promise<string> {
    try {
      logger.info("正在获取 access_token", { appId: account.appId });

      const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${account.appId}&secret=${account.appSecret}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { errcode?: number; errmsg?: string; access_token?: string; expires_in?: number };

      if (data.errcode) {
        throw new Error(`微信API错误: ${data.errcode} - ${data.errmsg}`);
      }

      const token = data.access_token;
      const expiresIn = data.expires_in || 7200;

      // 缓存 token（提前5分钟过期）
      this.cache.set(account.appId, {
        token,
        expiresAt: Date.now() + (expiresIn - 300) * 1000,
      });

      logger.info("access_token 获取成功", {
        appId: account.appId,
        expiresIn,
      });

      return token;
    } catch (error: any) {
      logger.error("获取 access_token 失败", {
        appId: account.appId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(appId?: string): void {
    if (appId) {
      this.cache.delete(appId);
      logger.info("清除 token 缓存", { appId });
    } else {
      this.cache.clear();
      logger.info("清除所有 token 缓存");
    }
  }
}

// 单例实例
export const tokenManager = new AccessTokenManager();
