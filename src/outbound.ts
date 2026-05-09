/**
 * OpenClaw 微信公众号插件 - Outbound 模块
 * 
 * 发送消息 (OpenClaw → 微信)
 * 支持两种方式:
 * 1. 被动回复 (Passive Reply) - 在5秒窗口内直接返回XML
 * 2. 客服接口 (Custom Service API) - 在48小时窗口内异步推送
 */

import { WeChatAccount } from "./types";
import { getAccessToken } from "./wechat-api";
import { encryptMessage } from "./crypto";
import { loadConfig } from "./config";

/**
 * 发送消息 (主入口)
 */
export async function sendMessage(
  account: WeChatAccount,
  target: { openid: string },
  content: string,
  messageType: string = "text"
): Promise<{ messageId: string }> {
  try {
    // 优先使用客服接口 (更灵活，支持更多类型)
    const result = await sendViaCustomService(account, target.openid, content, messageType);
    return result;
  } catch (error: any) {
    console.error("发送消息失败", { error: error.message, openid: target.openid });
    throw error;
  }
}

/**
 * 通过客服接口发送
 */
async function sendViaCustomService(
  account: WeChatAccount,
  openid: string,
  content: string,
  messageType: string = "text"
): Promise<{ messageId: string }> {
  const accessToken = await getAccessToken(account);
  const apiUrl = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;
  
  let messageBody: any = {
    touser: openid,
    msgtype: mapToWeChatMsgType(messageType),
  };
  
  // 根据消息类型构建body
  switch (messageType) {
    case "text":
      messageBody.text = { content };
      break;
    case "image":
      messageBody.image = { media_id: content };
      break;
    case "voice":
      messageBody.voice = { media_id: content };
      break;
    case "video":
      messageBody.video = { media_id: content };
      break;
    case "news":
      messageBody.news = JSON.parse(content);
      break;
    default:
      messageBody.text = { content };
  }
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messageBody),
  });
  
  const result = await response.json();
  
  if (result.errcode !== 0) {
    // 处理常见错误
    if (result.errcode === 45015) {
      // 48小时窗口过期
      throw new Error("用户已超过48小时未互动，无法主动推送消息");
    }
    throw new Error(`客服接口错误: ${result.errmsg}`);
  }
  
  return { messageId: result.msgid || `${Date.now()}` };
}

/**
 * 生成被动回复XML (用于5秒窗口内的同步回复)
 */
export function generatePassiveReplyXML(
  account: WeChatAccount,
  toOpenid: string,
  fromOpenid: string,
  content: string,
  messageType: string = "text"
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  
  let xmlContent = "";
  switch (messageType) {
    case "text":
      xmlContent = `
        <xml>
          <ToUserName><![CDATA[${toOpenid}]]></ToUserName>
          <FromUserName><![CDATA[${fromOpenid}]]></FromUserName>
          <CreateTime>${timestamp}</CreateTime>
          <MsgType><![CDATA[text]]></MsgType>
          <Content><![CDATA[${content}]]></Content>
        </xml>
      `;
      break;
    // 其他类型...
  }
  
  // 如果需要加密 (安全模式)，则加密XML
  const config = loadConfig();
  if (config.wechat.encodingAESKey) {
    return encryptMessage(xmlContent, account.encodingAESKey, account.appId);
  }
  
  return xmlContent;
}

/**
 * 消息类型映射
 */
function mapToWeChatMsgType(type: string): string {
  const typeMap: Record<string, string> = {
    "text": "text",
    "image": "image",
    "voice": "voice",
    "video": "video",
    "music": "music",
    "news": "news",
  };
  return typeMap[type] || "text";
}
