/**
 * OpenClaw 微信公众号插件 - Inbound 模块
 * 
 * 接收消息处理 (XML → OpenClaw)
 */

import { WeChatAccount, WeChatInboundMessage, OpenClawInboundRequest, OpenClawResponse } from "./types";
import { parseWeChatXMLAsync } from "./utils/xml-parser";
import { loadConfig } from "./config";
import { sendMessage } from "./outbound";
import { getAccessToken } from "./wechat-api";
import logger from "./utils/logger";

/**
 * 提交消息给OpenClaw核心
 */
export async function submitToOpenClaw(account: WeChatAccount, rawMessage: any): Promise<void> {
  try {
    logger.info("开始处理微信消息", { openid: rawMessage.FromUserName });
    
    // 1. 解析微信消息
    const message: WeChatInboundMessage = await parseWeChatXMLAsync(rawMessage);
    
    // 2. 处理事件消息
    if (message.MsgType === "event") {
      await handleEvent(account, message);
      return;
    }
    
    // 3. 转换为OpenClaw格式
    const openclawMessage = convertToOpenClawFormat(account, message);
    
    // 4. 提交给OpenClaw核心处理
    logger.debug("提交消息到OpenClaw", { 
      openid: message.FromUserName,
      messageType: message.MsgType 
    });
    
    const response = await callOpenClawAPI(openclawMessage);
    
    // 5. 处理OpenClaw回复
    await handleOpenClawResponse(account, message, response);
    
    logger.info("消息处理完成", { openid: message.FromUserName });
  } catch (error: any) {
    logger.error("提交消息到OpenClaw失败", { 
      error: error.message,
      stack: error.stack,
      openid: rawMessage.FromUserName 
    });
    
    // 发送兜底话术
    try {
      await sendFallbackMessage(account, rawMessage.FromUserName);
    } catch (fallbackError: any) {
      logger.error("发送兜底话术失败", { error: fallbackError.message });
    }
  }
}

/**
 * 处理事件消息
 */
async function handleEvent(account: WeChatAccount, message: WeChatInboundMessage): Promise<void> {
  const event = message.Event?.toLowerCase();
  
  logger.info("收到事件消息", { 
    openid: message.FromUserName, 
    event,
    eventKey: message.EventKey 
  });
  
  switch (event) {
    case "subscribe":
      // 关注事件
      logger.info("用户关注", { openid: message.FromUserName });
      await sendWelcomeMessage(account, message.FromUserName);
      break;
      
    case "unsubscribe":
      // 取消关注事件
      logger.info("用户取消关注", { openid: message.FromUserName });
      // 可以在这里处理用户取关后的清理工作
      break;
      
    case "CLICK":
      // 菜单点击事件
      logger.info("菜单点击", { 
        openid: message.FromUserName, 
        eventKey: message.EventKey 
      });
      await handleMenuClick(account, message);
      break;
      
    case "VIEW":
      // 菜单跳转事件
      logger.info("菜单跳转", { 
        openid: message.FromUserName, 
        eventKey: message.EventKey 
      });
      break;
      
    case "scan":
      // 扫描二维码事件
      logger.info("扫描二维码", { 
        openid: message.FromUserName, 
        eventKey: message.EventKey 
      });
      break;
      
    default:
      logger.warn("未知事件类型", { event });
  }
}

/**
 * 发送欢迎消息 (用户关注时)
 */
async function sendWelcomeMessage(account: WeChatAccount, openid: string): Promise<void> {
  const welcomeMessage = "感谢关注！我是OpenClaw智能助手，很高兴为您服务。";
  
  try {
    await sendMessage(account, { openid }, welcomeMessage, "text");
    logger.info("欢迎消息发送成功", { openid });
  } catch (error: any) {
    logger.error("欢迎消息发送失败", { error: error.message, openid });
  }
}

/**
 * 处理菜单点击事件
 */
async function handleMenuClick(account: WeChatAccount, message: WeChatInboundMessage): Promise<void> {
  const eventKey = message.EventKey || "";
  
  // 根据不同的菜单键值，发送不同的回复
  let replyContent = "";
  
  switch (eventKey) {
    case "MENU_HELP":
      replyContent = "这是帮助文档，您可以...";
      break;
    case "MENU_CONTACT":
      replyContent = "联系电话: 400-xxx-xxxx";
      break;
    default:
      replyContent = `您点击了菜单: ${eventKey}`;
  }
  
  try {
    await sendMessage(account, { openid: message.FromUserName }, replyContent, "text");
  } catch (error: any) {
    logger.error("菜单点击回复失败", { error: error.message });
  }
}

/**
 * 转换为OpenClaw格式
 */
export function convertToOpenClawFormat(account: WeChatAccount, message: WeChatInboundMessage): OpenClawInboundRequest {
  const config = loadConfig();
  
  // 根据消息类型构建内容
  let content = "";
  let mediaUrl = "";
  
  switch (message.MsgType) {
    case "text":
      content = message.Content || "";
      break;
    case "image":
      content = "[图片消息]";
      mediaUrl = message.MediaUrl || "";
      break;
    case "voice":
      content = message.Recognition || message.Content || "[语音消息]";
      break;
    case "video":
      content = message.MediaId || "[视频消息]";
      break;
    case "shortvideo":
      content = message.MediaId || "[小视频消息]";
      break;
    case "location":
      content = `位置: ${message.Label || ''} (${message.Location_X}, ${message.Location_Y})`;
      break;
    case "link":
      content = `链接: ${message.Title || ''} - ${message.Url || ''}`;
      break;
    default:
      content = message.Content || "[未知消息类型]";
  }
  
  return {
    // 用户标识 (OpenID)
    userId: message.FromUserName,
    
    // 消息内容
    message: content,
    messageType: mapMessageType(message.MsgType),
    
    // 媒体内容 (如果是图片/语音)
    mediaUrl: mediaUrl,
    
    // 知识库ID (从配置读取)
    knowledgeBaseId: config.openclaw.knowledgeBaseId,
    
    // 会话ID (用于多轮对话)
    sessionId: `wechat_${message.FromUserName}`,
    
    // 附加信息
    metadata: {
      channel: "wechat",
      msgId: message.MsgId,
      createTime: message.CreateTime,
      msgType: message.MsgType,
    },
  };
}

/**
 * 调用OpenClaw API
 */
async function callOpenClawAPI(request: OpenClawInboundRequest): Promise<OpenClawResponse> {
  const config = loadConfig();
  
  // 测试模式：如果 API URL 是默认值或未配置，使用 echo 回复
  const isTestMode = !config.openclaw.apiUrl || 
                    config.openclaw.apiUrl === "https://api.openclaw.ai" ||
                    config.openclaw.apiUrl.includes("your-openclaw-domain.com");
  
  if (isTestMode) {
    logger.info("测试模式：OpenClaw API 未配置，使用 echo 回复", { 
      userId: request.userId,
      message: request.message 
    });
    
    // 测试模式：echo 回复 + 欢迎语
    const echoReply = `📞 测试模式已启用\n\n您说：${request.message}\n\n（这是测试回复，OpenClaw API 尚未配置）`;
    
    return {
      success: true,
      reply: echoReply,
      content: echoReply,
    };
  }
  
  // OpenClaw API调用
  const baseUrl = config.openclaw.apiUrl.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/api/wechat/chat`;
  
  logger.debug("调用OpenClaw API", { apiUrl, userId: request.userId });
  
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
  
  const result = await response.json() as OpenClawResponse;
  logger.debug("OpenClaw API返回", { reply: result.reply || result.content });
  
  return result;
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
    logger.warn("OpenClaw返回空回复");
    return;
  }
  
  try {
    // 通过客服接口发送
    await sendMessage(account, { openid: originalMessage.FromUserName }, replyContent, "text");
    logger.info("回复发送成功", { 
      openid: originalMessage.FromUserName,
      replyLength: replyContent.length 
    });
  } catch (error: any) {
    logger.error("回复发送失败", { 
      error: error.message,
      openid: originalMessage.FromUserName 
    });
    throw error;
  }
}

/**
 * 发送兜底话术
 */
async function sendFallbackMessage(account: WeChatAccount, openid: string): Promise<void> {
  const fallbackMessage = "抱歉，系统暂时无法处理您的请求，请稍后再试或联系人工客服。";
  
  try {
    await sendMessage(account, { openid }, fallbackMessage, "text");
    logger.info("兜底话术发送成功", { openid });
  } catch (error: any) {
    logger.error("兜底话术发送失败", { error: error.message, openid });
    throw error;
  }
}

/**
 * 类型映射 (微信 → OpenClaw)
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
    "event": "event",
  };
  return typeMap[wechatMsgType] || "text";
}

/**
 * 获取用户信息并增强消息
 */
async function enrichMessageWithUserInfo(
  account: WeChatAccount, 
  message: WeChatInboundMessage
): Promise<WeChatInboundMessage> {
  try {
    const userInfo = await getUserInfo(account, message.FromUserName);
    
    // 将用户信息附加到消息中
    (message as any).userInfo = userInfo;
    
    logger.debug("获取用户信息成功", { 
      openid: message.FromUserName,
      nickname: userInfo.nickname 
    });
  } catch (error: any) {
    logger.warn("获取用户信息失败", { 
      error: error.message,
      openid: message.FromUserName 
    });
  }
  
  return message;
}

/**
 * 获取用户信息 (封装)
 */
async function getUserInfo(account: WeChatAccount, openid: string): Promise<any> {
  const accessToken = await getAccessToken(account);
  
  const response = await fetch(
    `https://api.weixin.qq.com/cgi-bin/user/info?access_token=${accessToken}&openid=${openid}&lang=zh_CN`,
    {
      signal: AbortSignal.timeout(5000),
    }
  );
  
  if (!response.ok) {
    throw new Error(`获取用户信息失败: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}
