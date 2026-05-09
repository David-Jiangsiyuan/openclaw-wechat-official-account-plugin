/**
 * OpenClaw 微信公众号插件 - 微信API封装
 * 
 * 封装微信公众平台API调用
 */

import axios from "axios";
import { WeChatAccount } from "./types";
import { loadConfig } from "./config";

// Access Token 缓存
let cachedAccessToken: string | null = null;
let tokenExpiryTime: number = 0;

/**
 * 获取 Access Token
 */
export async function getAccessToken(account: WeChatAccount): Promise<string> {
  const now = Date.now();
  
  // 如果token还未过期，直接返回缓存的token
  if (cachedAccessToken && now < tokenExpiryTime) {
    return cachedAccessToken;
  }
  
  const config = loadConfig();
  const { appId, appSecret } = config.wechat;
  
  try {
    const response = await axios.get("https://api.weixin.qq.com/cgi-bin/token", {
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
    tokenExpiryTime = now + (response.data.expires_in - 300) * 1000;
    
    return cachedAccessToken;
  } catch (error: any) {
    throw new Error(`请求微信API失败: ${error.message}`);
  }
}

/**
 * 获取用户信息
 */
export async function getUserInfo(account: WeChatAccount, openid: string): Promise<any> {
  const accessToken = await getAccessToken(account);
  
  try {
    const response = await axios.get("https://api.weixin.qq.com/cgi-bin/user/info", {
      params: {
        access_token: accessToken,
        openid: openid,
        lang: "zh_CN",
      },
    });
    
    if (response.data.errcode) {
      throw new Error(`获取用户信息失败: ${response.data.errmsg}`);
    }
    
    return response.data;
  } catch (error: any) {
    throw new Error(`请求微信API失败: ${error.message}`);
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
  const accessToken = await getAccessToken(account);
  
  try {
    const FormData = require("form-data");
    const fs = require("fs");
    const form = new FormData();
    form.append("media", fs.createReadStream(mediaPath));
    
    const response = await axios.post(
      `https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${accessToken}&type=${type}`,
      form,
      {
        headers: form.getHeaders(),
      }
    );
    
    if (response.data.errcode) {
      throw new Error(`上传素材失败: ${response.data.errmsg}`);
    }
    
    return response.data.media_id;
  } catch (error: any) {
    throw new Error(`请求微信API失败: ${error.message}`);
  }
}
