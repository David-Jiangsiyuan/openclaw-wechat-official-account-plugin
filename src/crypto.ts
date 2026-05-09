/**
 * OpenClaw 微信公众号插件 - Crypto 模块
 * 
 * 微信消息加解密 (AES-256-CBC)
 * 
 * 加密流程:
 * 1. 随机生成16字节字符串
 * 2. 拼接: random(16B) + msg_len(4B) + msg_content + appid
 * 3. AES-256-CBC加密
 * 4. Base64编码
 * 
 * 解密流程:
 * 1. Base64解码
 * 2. AES-256-CBC解密
 * 3. 去除随机字符串和填充
 * 4. 提取消息内容
 * 
 * 兼容微信公众号和企业微信的加密规范
 */

import crypto from "crypto";
import { logger } from "./utils/logger";

/**
 * MsgCrypt 类 - 封装微信消息加解密
 * 兼容微信公众号和企业微信
 */
export class MsgCrypt {
  private token: string;
  private encodingAESKey: string;
  private appId: string;
  private key: Buffer;
  private iv: Buffer;

  /**
   * 构造函数
   * @param token - 开发者Token
   * @param encodingAESKey - 43位EncodingAESKey
   * @param appId - 公众号AppID或企业微信CorpID
   */
  constructor(token: string, encodingAESKey: string, appId: string) {
    this.token = token;
    this.encodingAESKey = encodingAESKey;
    this.appId = appId;
    
    // Base64解码AESKey (43位 → 32字节)
    this.key = Buffer.from(encodingAESKey + "=", "base64");
    
    // IV = key的前16字节
    this.iv = this.key.slice(0, 16);
    
    // 验证key长度
    if (this.key.length !== 32) {
      throw new Error(`Invalid AESKey length: expected 32, got ${this.key.length}`);
    }
  }

  /**
   * 解密消息
   * @param encryptedMsg - Base64编码的加密消息
   * @returns 解密后的明文消息
   */
  decrypt(encryptedMsg: string): string {
    try {
      logger.debug("开始解密消息");
      
      // 1. Base64解码
      const encryptedBuffer = Buffer.from(encryptedMsg, "base64");
      
      // 2. 创建解密器
      const decipher = crypto.createDecipheriv("aes-256-cbc", this.key, this.iv);
      decipher.setAutoPadding(false); // 手动处理填充
      
      // 3. 解密
      let decrypted = decipher.update(encryptedBuffer);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      // 4. 去除PKCS7填充
      decrypted = this.removePKCS7Padding(decrypted as any) as any;
      
      // 5. 去除随机前缀 (前16字节是随机字符串)
      const randomStrLen = 16;
      const msgLenBuf = decrypted.slice(randomStrLen, randomStrLen + 4);
      const msgLen = msgLenBuf.readUInt32BE(0);
      
      const contentStart = randomStrLen + 4;
      const contentEnd = contentStart + msgLen;
      const messageContent = decrypted.slice(contentStart, contentEnd).toString("utf-8");
      
      // 6. 验证AppID
      const appIdStart = contentEnd;
      const receivedAppId = decrypted.slice(appIdStart).toString("utf-8");
      
      if (receivedAppId !== this.appId) {
        logger.warn("AppID不匹配", { 
          expected: this.appId, 
          received: receivedAppId 
        });
        // 注意：这里不抛出错误，因为某些情况下可能允许
      }
      
      logger.debug("消息解密成功");
      return messageContent;
    } catch (error: any) {
      logger.error("消息解密失败", { error: error.message });
      throw new Error(`消息解密失败: ${error.message}`);
    }
  }

  /**
   * 加密消息
   * @param msg - 明文消息 (XML格式)
   * @returns Base64编码的加密消息
   */
  encrypt(msg: string): string {
    try {
      logger.debug("开始加密消息");
      
      // 1. 生成16字节随机字符串
      const randomStr = crypto.randomBytes(16);
      
      // 2. 消息长度 (4字节网络字节序)
      const msgBuf = Buffer.from(msg, "utf-8");
      const msgLenBuf = Buffer.alloc(4);
      msgLenBuf.writeUInt32BE(msgBuf.length, 0);
      
      // 3. AppID
      const appIdBuf = Buffer.from(this.appId, "utf-8");
      
      // 4. 拼接
      const plainText = Buffer.concat([randomStr, msgLenBuf, msgBuf, appIdBuf]);
      
      // 5. PKCS7填充
      const paddedPlainText = this.addPKCS7Padding(plainText, 32);
      
      // 6. AES-256-CBC加密
      const cipher = crypto.createCipheriv("aes-256-cbc", this.key, this.iv);
      cipher.setAutoPadding(false);
      
      let encrypted = cipher.update(paddedPlainText);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // 7. Base64编码
      const encoded = encrypted.toString("base64");
      
      logger.debug("消息加密成功");
      return encoded;
    } catch (error: any) {
      logger.error("消息加密失败", { error: error.message });
      throw new Error(`消息加密失败: ${error.message}`);
    }
  }

  /**
   * 生成签名 (用于URL验证和消息签名)
   * @param timestamp - 时间戳
   * @param nonce - 随机数
   * @param encrypt - 加密后的消息 (可选)
   * @returns SHA1签名
   */
  generateSignature(timestamp: string, nonce: string, encrypt?: string): string {
    // 字典序排序
    const array = [this.token, timestamp, nonce];
    if (encrypt) {
      array.push(encrypt);
    }
    array.sort();
    
    // 拼接字符串
    const str = array.join("");
    
    // SHA1加密
    const sha1 = crypto.createHash("sha1");
    sha1.update(str);
    return sha1.digest("hex");
  }

  /**
   * 验证签名
   * @param signature - 微信传来的签名
   * @param timestamp - 时间戳
   * @param nonce - 随机数
   * @param encrypt - 加密后的消息 (可选)
   * @returns 是否验证通过
   */
  verifySignature(signature: string, timestamp: string, nonce: string, encrypt?: string): boolean {
    const calculatedSignature = this.generateSignature(timestamp, nonce, encrypt);
    const result = calculatedSignature === signature;
    
    if (!result) {
      logger.warn("签名验证失败", { 
        expected: calculatedSignature, 
        received: signature 
      });
    }
    
    return result;
  }

  /**
   * 去除PKCS7填充
   */
  private removePKCS7Padding(buf: Buffer): Buffer {
    const paddingLen = buf[buf.length - 1];
    if (paddingLen < 1 || paddingLen > 32) {
      throw new Error(`无效的PKCS7填充: ${paddingLen}`);
    }
    return buf.slice(0, buf.length - paddingLen);
  }

  /**
   * 添加PKCS7填充
   */
  private addPKCS7Padding(buf: Buffer, blockSize: number): Buffer {
    const paddingLen = blockSize - (buf.length % blockSize);
    const padding = Buffer.alloc(paddingLen, paddingLen);
    return Buffer.concat([buf, padding]);
  }
}

/**
 * 解密消息 (兼容旧接口)
 * @param encryptedData - 加密数据 (Buffer或Base64字符串)
 * @param encodingAESKey - 43位EncodingAESKey
 * @returns 解密后的明文
 */
export function decryptMessage(encryptedData: Buffer | string, encodingAESKey: string): string {
  try {
    // 1. Base64解码AESKey (43位 → 32字节)
    const key = Buffer.from(encodingAESKey + "=", "base64");
    
    // 2. IV = key的前16字节
    const iv = key.slice(0, 16);
    
    // 3. Base64解码加密数据
    const encryptedBuffer = Buffer.isBuffer(encryptedData) 
      ? Buffer.from(encryptedData.toString(), "base64")
      : Buffer.from(encryptedData, "base64");
    
    // 4. 创建解密器
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    decipher.setAutoPadding(false); // 手动处理填充
    
    // 5. 解密
    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // 6. 去除PKCS7填充
    // @ts-ignore
    decrypted = removePKCS7Padding(decrypted);
    
    // 7. 去除随机前缀 (前16字节是随机字符串)
    const randomStrLen = 16;
    const msgLenBuf = decrypted.slice(randomStrLen, randomStrLen + 4);
    const msgLen = msgLenBuf.readUInt32BE(0);
    
    const contentStart = randomStrLen + 4;
    const contentEnd = contentStart + msgLen;
    const messageContent = decrypted.slice(contentStart, contentEnd).toString("utf-8");
    
    // 8. 验证AppID (可选)
    const appIdStart = contentEnd;
    const appId = decrypted.slice(appIdStart).toString("utf-8");
    
    return messageContent;
  } catch (error: any) {
    throw new Error(`消息解密失败: ${error.message}`);
  }
}

/**
 * 加密消息 (兼容旧接口)
 * @param xml - 明文XML
 * @param encodingAESKey - 43位EncodingAESKey
 * @param appId - 公众号AppID
 * @returns Base64编码的加密消息
 */
export function encryptMessage(xml: string, encodingAESKey: string, appId: string): string {
  try {
    // 1. 生成16字节随机字符串
    const randomStr = crypto.randomBytes(16);
    
    // 2. 消息长度 (4字节网络字节序)
    const msgBuf = Buffer.from(xml, "utf-8");
    const msgLenBuf = Buffer.alloc(4);
    msgLenBuf.writeUInt32BE(msgBuf.length, 0);
    
    // 3. AppID
    const appIdBuf = Buffer.from(appId, "utf-8");
    
    // 4. 拼接
    const plainText = Buffer.concat([randomStr, msgLenBuf, msgBuf, appIdBuf]);
    
    // 5. PKCS7填充
    const paddedPlainText = addPKCS7Padding(plainText, 32);
    
    // 6. AES-256-CBC加密
    const key = Buffer.from(encodingAESKey + "=", "base64");
    const iv = key.slice(0, 16);
    
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    cipher.setAutoPadding(false);
    
    let encrypted = cipher.update(paddedPlainText);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // 7. Base64编码
    return encrypted.toString("base64");
  } catch (error: any) {
    throw new Error(`消息加密失败: ${error.message}`);
  }
}

/**
 * 去除PKCS7填充
 */
function removePKCS7Padding(buf: Buffer): Buffer {
  const paddingLen = buf[buf.length - 1];
  if (paddingLen < 1 || paddingLen > 32) {
    throw new Error(`无效的PKCS7填充: ${paddingLen}`);
  }
  return buf.slice(0, buf.length - paddingLen);
}

/**
 * 添加PKCS7填充
 */
function addPKCS7Padding(buf: Buffer, blockSize: number): Buffer {
  const paddingLen = blockSize - (buf.length % blockSize);
  const padding = Buffer.alloc(paddingLen, paddingLen);
  return Buffer.concat([buf, padding]);
}

/**
 * 验证微信签名 (兼容旧接口)
 * @param token - 开发者Token
 * @param timestamp - 时间戳
 * @param nonce - 随机数
 * @param signature - 微信传来的签名
 * @returns 是否验证通过
 */
export function verifySignature(
  token: string, 
  timestamp: string, 
  nonce: string, 
  signature: string
): boolean {
  // 字典序排序
  const array = [token, timestamp, nonce].sort();
  
  // 拼接字符串
  const str = array.join("");
  
  // SHA1加密
  const sha1 = crypto.createHash("sha1");
  sha1.update(str);
  const encoded = sha1.digest("hex");
  
  // 对比签名
  return encoded === signature;
}

/**
 * 生成微信签名 (兼容旧接口)
 */
export function generateSignature(token: string, timestamp: string, nonce: string): string {
  const array = [token, timestamp, nonce].sort();
  const str = array.join("");
  
  const sha1 = crypto.createHash("sha1");
  sha1.update(str);
  return sha1.digest("hex");
}
