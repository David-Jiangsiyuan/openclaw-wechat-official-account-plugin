/**
 * OpenClaw 微信公众号插件 - 微信API封装
 * 
 * 封装微信公众平台API调用
 * 包括：access_token管理、客服消息、用户管理、菜单管理等
 */

import axios, { AxiosInstance } from "axios";
import { WeChatAccount, WeChatAPIResponse } from "./types";
import { loadConfig } from "./config";
import { logger } from "./utils/logger";

// 创建axios实例
const apiClient: AxiosInstance = axios.create({
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Access Token 缓存
let cachedAccessToken: string | null = null;
let tokenExpiryTime: number = 0;
let tokenRefreshPromise: Promise<string> | null = null;

/**
 * 获取 Access Token (带缓存和自动刷新)
 */
export async function getAccessToken(account: WeChatAccount): Promise<string> {
  const now = Date.now();
  
  // 如果token还未过期，直接返回缓存的token
  if (cachedAccessToken && now < tokenExpiryTime) {
    logger.debug("使用缓存的access_token");
    return cachedAccessToken;
  }
  
  // 如果正在刷新，等待刷新完成
  if (tokenRefreshPromise) {
    logger.debug("等待access_token刷新完成");
    return tokenRefreshPromise;
  }
  
  // 开始刷新token
  tokenRefreshPromise = refreshAccessToken(account);
  
  try {
    const token = await tokenRefreshPromise;
    return token;
  } finally {
    tokenRefreshPromise = null;
  }
}

/**
 * 刷新 Access Token
 */
async function refreshAccessToken(account: WeChatAccount): Promise<string> {
  const config = loadConfig();
  const { appId, appSecret } = config.wechat;
  
  if (!appId || !appSecret) {
    throw new Error("appId或appSecret未配置");
  }
  
  try {
    logger.info("刷新access_token");
    
    const response = await apiClient.get("https://api.weixin.qq.com/cgi-bin/token", {
      params: {
        grant_type: "client_credential",
        appid: appId,
        secret: appSecret,
      },
    });
    
    if (response.data.errcode) {
      throw new Error(`获取access_token失败: ${response.data.errmsg}`);
    }
    
    cachedAccessToken = response.data.access_token;
    // 提前5分钟过期
    tokenExpiryTime = Date.now() + (response.data.expires_in - 300) * 1000;
    
    logger.info("access_token刷新成功", { 
      expires_in: response.data.expires_in,
      expiryTime: new Date(tokenExpiryTime).toISOString()
    });
    
    return cachedAccessToken;
  } catch (error: any) {
    logger.error("刷新access_token失败", { error: error.message });
    throw new Error(`请求微信API失败: ${error.message}`);
  }
}

/**
 * 获取 Access Token (带重试)
 */
export async function getAccessTokenWithRetry(
  account: WeChatAccount, 
  retryCount: number = 0
): Promise<string> {
  try {
    return await getAccessToken(account);
  } catch (error: any) {
    if (retryCount < 3) {
      logger.warn("获取access_token失败，准备重试", { retryCount: retryCount + 1 });
      await sleep(1000 * (retryCount + 1));
      return getAccessTokenWithRetry(account, retryCount + 1);
    }
    throw error;
  }
}

/**
 * 发送客服消息
 */
export async function sendCustomMessage(
  account: WeChatAccount,
  openid: string,
  msgType: string,
  content: any
): Promise<WeChatAPIResponse> {
  const accessToken = await getAccessTokenWithRetry(account);
  const apiUrl = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;
  
  let messageBody: any = {
    touser: openid,
    msgtype: msgType,
  };
  
  // 根据消息类型构建body
  switch (msgType) {
    case "text":
      messageBody.text = { content: content };
      break;
    case "image":
      messageBody.image = { media_id: content };
      break;
    case "voice":
      messageBody.voice = { media_id: content };
      break;
    case "video":
      messageBody.video = { 
        media_id: content.media_id,
        thumb_media_id: content.thumb_media_id || content.media_id,
        title: content.title || "",
        description: content.description || ""
      };
      break;
    case "music":
      messageBody.music = content;
      break;
    case "news":
      messageBody.news = { articles: content };
      break;
    case "mpnews":
      messageBody.mpnews = { media_id: content };
      break;
    default:
      throw new Error(`不支持的消息类型: ${msgType}`);
  }
  
  try {
    const response = await apiClient.post(apiUrl, messageBody);
    
    if (response.data.errcode !== 0) {
      // 处理常见错误
      if (response.data.errcode === 45015) {
        throw new Error("用户已超过48小时未互动，无法主动推送消息");
      } else if (response.data.errcode === 45009) {
        throw new Error("客服接口调用次数达到上限，请稍后再试");
      } else if (response.data.errcode === 40001) {
        // access_token无效，清除缓存
        cachedAccessToken = null;
        throw new Error("access_token无效，需要重新获取");
      }
      throw new Error(`客服接口错误 (${response.data.errcode}): ${response.data.errmsg}`);
    }
    
    logger.info("客服消息发送成功", { openid, msgType, msgid: response.data.msgid });
    return response.data;
  } catch (error: any) {
    logger.error("发送客服消息失败", { error: error.message, openid, msgType });
    throw error;
  }
}

/**
 * 获取用户信息
 */
export async function getUserInfo(account: WeChatAccount, openid: string): Promise<any> {
  const accessToken = await getAccessTokenWithRetry(account);
  
  try {
    const response = await apiClient.get("https://api.weixin.qq.com/cgi-bin/user/info", {
      params: {
        access_token: accessToken,
        openid: openid,
        lang: "zh_CN",
      },
    });
    
    if (response.data.errcode) {
      throw new Error(`获取用户信息失败: ${response.data.errmsg}`);
    }
    
    logger.debug("获取用户信息成功", { openid });
    return response.data;
  } catch (error: any) {
    logger.error("获取用户信息失败", { error: error.message, openid });
    throw new Error(`请求微信API失败: ${error.message}`);
  }
}

/**
 * 创建菜单
 */
export async function createMenu(account: WeChatAccount, menuData: any): Promise<WeChatAPIResponse> {
  const accessToken = await getAccessTokenWithRetry(account);
  const apiUrl = `https://api.weixin.qq.com/cgi-bin/menu/create?access_token=${accessToken}`;
  
  try {
    const response = await apiClient.post(apiUrl, menuData);
    
    if (response.data.errcode !== 0) {
      throw new Error(`创建菜单失败 (${response.data.errcode}): ${response.data.errmsg}`);
    }
    
    logger.info("菜单创建成功");
    return response.data;
  } catch (error: any) {
    logger.error("创建菜单失败", { error: error.message });
    throw error;
  }
}

/**
 * 获取菜单
 */
export async function getMenu(account: WeChatAccount): Promise<any> {
  const accessToken = await getAccessTokenWithRetry(account);
  const apiUrl = `https://api.weixin.qq.com/cgi-bin/menu/get?access_token=${accessToken}`;
  
  try {
    const response = await apiClient.get(apiUrl);
    
    if (response.data.errcode) {
      throw new Error(`获取菜单失败 (${response.data.errcode}): ${response.data.errmsg}`);
    }
    
    logger.debug("获取菜单成功");
    return response.data;
  } catch (error: any) {
    logger.error("获取菜单失败", { error: error.message });
    throw error;
  }
}

/**
 * 删除菜单
 */
export async function deleteMenu(account: WeChatAccount): Promise<WeChatAPIResponse> {
  const accessToken = await getAccessTokenWithRetry(account);
  const apiUrl = `https://api.weixin.qq.com/cgi-bin/menu/delete?access_token=${accessToken}`;
  
  try {
    const response = await apiClient.get(apiUrl);
    
    if (response.data.errcode !== 0) {
      throw new Error(`删除菜单失败 (${response.data.errcode}): ${response.data.errmsg}`);
    }
    
    logger.info("菜单删除成功");
    return response.data;
  } catch (error: any) {
    logger.error("删除菜单失败", { error: error.message });
    throw error;
  }
}

/**
 * 上传临时素材
 */
export async function uploadMedia(
  account: WeChatAccount, 
  type: string, 
  mediaPath: string
): Promise<string> {
  const accessToken = await getAccessTokenWithRetry(account);
  const apiUrl = `https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${accessToken}&type=${type}`;
  
  try {
    const FormData = require("form-data");
    const fs = require("fs");
    const form = new FormData();
    form.append("media", fs.createReadStream(mediaPath));
    
    const response = await axios.post(apiUrl, form, {
      headers: form.getHeaders(),
      timeout: 30000, // 上传文件超时时间延长
    });
    
    if (response.data.errcode) {
      throw new Error(`上传素材失败: ${response.data.errmsg}`);
    }
    
    logger.info("素材上传成功", { type, media_id: response.data.media_id });
    return response.data.media_id;
  } catch (error: any) {
    logger.error("上传素材失败", { error: error.message, type });
    throw new Error(`上传素材失败: ${error.message}`);
  }
}

/**
 * 获取临时素材
 */
export async function getMedia(account: WeChatAccount, mediaId: string): Promise<any> {
  const accessToken = await getAccessTokenWithRetry(account);
  const apiUrl = `https://api.weixin.qq.com/cgi-bin/media/get?access_token=${accessToken}&media_id=${mediaId}`;
  
  try {
    const response = await apiClient.get(apiUrl, {
      responseType: "arraybuffer",
    });
    
    logger.debug("获取素材成功", { mediaId });
    return response.data;
  } catch (error: any) {
    logger.error("获取素材失败", { error: error.message, mediaId });
    throw new Error(`获取素材失败: ${error.message}`);
  }
}

/**
 * 发送模板消息
 */
export async function sendTemplateMessage(
  account: WeChatAccount,
  openid: string,
  templateId: string,
  data: any,
  url?: string,
  miniprogram?: any
): Promise<WeChatAPIResponse> {
  const accessToken = await getAccessTokenWithRetry(account);
  const apiUrl = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`;
  
  const messageBody: any = {
    touser: openid,
    template_id: templateId,
    data: data,
  };
  
  if (url) {
    messageBody.url = url;
  }
  
  if (miniprogram) {
    messageBody.miniprogram = miniprogram;
  }
  
  try {
    const response = await apiClient.post(apiUrl, messageBody);
    
    if (response.data.errcode !== 0) {
      throw new Error(`发送模板消息失败 (${response.data.errcode}): ${response.data.errmsg}`);
    }
    
    logger.info("模板消息发送成功", { openid, templateId, msgid: response.data.msgid });
    return response.data;
  } catch (error: any) {
    logger.error("发送模板消息失败", { error: error.message, openid, templateId });
    throw error;
  }
}

/**
 * 睡眠函数 (用于重试延迟)
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 清除access_token缓存 (用于测试或强制刷新)
 */
export function clearTokenCache(): void {
  cachedAccessToken = null;
  tokenExpiryTime = 0;
  logger.info("access_token缓存已清除");
}
