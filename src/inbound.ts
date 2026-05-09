/**
 * OpenClaw 微信公众号插件 - Inbound 模块
 * 
 * 接收消息处理 (XML → OpenClaw)
 */

import { WeChatAccount, WeChatInboundMessage, OpenClawInboundRequest, OpenClawResponse } from "./types";
import { parseWeChatXML } from "./utils/xml-parser";
import { loadConfig } from "./config";
import * as wechatApi from "./wechat-api";

/**
 * 提交消息给OpenClaw核心
 */
export async function submitToOpenClaw(account: WeChatAccount, rawMessage: any): Promise<void> {
  try {
    // 1. 解析微信消息
    const message: WeChatInboundMessage = parseWeChatXML(rawMessage);
    
    // 2. 转换为OpenClaw格式
    const openclawMessage = convertToOpenClawFormat(account, message);
    
    // 3. 提交给OpenClaw核心处理
    const response = await callOpenClawAPI(openclawMessage);
    
    // 4. 处理OpenClaw回复
    await handleOpenClawResponse(account, message, response);
    
  } catch (error: any) {
    console.error("提交消息到OpenClaw失败", { error: error.message });
    // 发送兜底话术
    await sendFallbackMessage(account, rawMessage.FromUserName);
  }
}

/**
 * 转换为OpenClaw格式
 */
function convertToOpenClawFormat(account: WeChatAccount, message: WeChatInboundMessage): OpenClawInboundRequest {
  const config = loadConfig();
  
  return {
    // 用户标识 (OpenID)
    userId: message.FromUserName,
    
    // 消息内容
    message: message.Content || "",
    messageType: mapMessageType(message.MsgType),
    
    // 媒体内容 (如果是图片/语音)
    mediaUrl: message.MediaUrl || "",
    
    // 知识库ID (从配置读取)
    knowledgeBaseId: config.openclaw.knowledgeBaseId,
    
    // 会话ID (用于多轮对话)
    sessionId: `wechat_${message.FromUserName}`,
    
    // 附加信息
    metadata: {
      channel: "wechat",
      msgId: message.MsgId,
      createTime: message.CreateTime,
    },
  };
}

/**
 * 调用OpenClaw API
 */
async function callOpenClawAPI(request: OpenClawInboundRequest): Promise<OpenClawResponse> {
  const config = loadConfig();
  
  // OpenClaw API调用
  const apiUrl = `https://${config.server.host}/api/wechat/chat`;
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    // 设置超时
    signal: AbortSignal.timeout(config.openclaw.apiTimeout || 10000),
  });
  
  if (!response.ok) {
    throw new Error(`OpenClaw API调用失败: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * 处理OpenClaw回复
 */
async function handleOpenClawResponse(
  account: WeChatAccount, 
  originalMessage: WeChatInboundMessage,
  openclawResponse: OpenClawResponse
): Promise<void> {
  const replyContent = openclawResponse.reply || openclawResponse.content || "";
  
  if (!replyContent) {
    console.warn("OpenClaw返回空回复");
    return;
  }
  
  // 通过客服接口发送
  await sendViaCustomService(account, originalMessage.FromUserName, replyContent);
}

/**
 * 通过客服接口发送
 */
async function sendViaCustomService(account: WeChatAccount, openid: string, content: string): Promise<void> {
  const accessToken = await wechatApi.getAccessToken(account);
  const apiUrl = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      touser: openid,
      msgtype: "text",
      text: { content },
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`客服接口调用失败: ${error.errmsg}`);
  }
}

/**
 * 发送兜底话术
 */
async function sendFallbackMessage(account: WeChatAccount, openid: string): Promise<void> {
  const fallbackMessage = "抱歉，系统暂时无法处理您的请求，请稍后再试或联系人工客服。";
  await sendViaCustomService(account, openid, fallbackMessage);
}

/**
 * 类型映射
 */
function mapMessageType(wechatMsgType: string): string {
  const typeMap: Record<string, string> = {
    "text": "text",
    "image": "image",
    "voice": "voice",
    "video": "video",
    "shortvideo": "video",
    "location": "location",
    "link": "link",
  };
  return typeMap[wechatMsgType] || "text";
}
