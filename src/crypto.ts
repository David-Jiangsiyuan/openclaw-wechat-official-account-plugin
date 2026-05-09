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
 */

import crypto from "crypto";

/**
 * 解密消息
 */
export function decryptMessage(encryptedData: Buffer, encodingAESKey: string): string {
  try {
    // 1. Base64解码AESKey (43位 → 32字节)
    const key = Buffer.from(encodingAESKey + "=", "base64");
    
    // 2. IV = key的前16字节
    const iv = key.slice(0, 16);
    
    // 3. Base64解码加密数据
    const encryptedBuffer = Buffer.from(encryptedData.toString(), "base64");
    
    // 4. 创建解密器
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    decipher.setAutoPadding(false);  // 手动处理填充
    
    // 5. 解密
    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // 6. 去除PKCS7填充
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
 * 加密消息
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
  if (paddingLen > 32) {
    throw new Error("无效的PKCS7填充");
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
