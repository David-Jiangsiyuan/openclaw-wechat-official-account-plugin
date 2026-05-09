/**
 * OpenClaw 微信公众号插件 - 签名验证工具
 * 
 * 验证微信服务器发送的签名
 */

import crypto from "crypto";

/**
 * 验证微信签名
 * 
 * 微信签名算法:
 * 1. 将token、timestamp、nonce三个参数进行字典序排序
 * 2. 将三个参数字符串拼接成一个字符串
 * 3. 进行sha1加密
 * 4. 开发者获得加密后的字符串可与signature对比
 */
export function verifySignature(
  token: string, 
  timestamp: string, 
  nonce: string, 
  signature: string
): boolean {
  // 1. 字典序排序
  const array = [token, timestamp, nonce].sort();
  
  // 2. 拼接字符串
  const str = array.join("");
  
  // 3. sha1加密
  const sha1 = crypto.createHash("sha1");
  sha1.update(str);
  const encoded = sha1.digest("hex");
  
  // 4. 对比签名
  return encoded === signature;
}

/**
 * 生成签名 (用于主动调用微信API时的签名验证)
 */
export function generateSignature(
  token: string,
  timestamp: string,
  nonce: string
): string {
  const array = [token, timestamp, nonce].sort();
  const str = array.join("");
  
  const sha1 = crypto.createHash("sha1");
  sha1.update(str);
  return sha1.digest("hex");
}
