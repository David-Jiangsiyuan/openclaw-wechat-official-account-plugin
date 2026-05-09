/**
 * OpenClaw 微信公众号插件 - Outbound 模块
 * 
 * 发送消息 (OpenClaw → 微信)
 * 支持两种方式:
 * 1. 被动回复 (Passive Reply) - 在5秒窗口内直接返回XML
 * 2. 客服接口 (Custom Service API) - 在48小时窗口内异步推送
 */

import { WeChatAccount } from "./types";
import { getAccessToken, getAccessTokenWithRetry } from "./wechat-api";
import { encryptMessage } from "./crypto";
import { loadConfig } from "./config";
import { logger } from "./utils/logger";

/**
 * 发送消息 (主入口)
 * @param account - 微信账户配置
 * @param target - 目标用户 { openid: string }
 * @param content - 消息内容
 * @param messageType - 消息类型 (text, image, voice, video, news)
 * @param retryCount - 重试次数 (内部使用)
 */
export async function sendMessage(
  account: WeChatAccount,
  target: { openid: string },
  content: string,
  messageType: string = "text",
  retryCount: number = 0
): Promise<{ messageId: string }> {
  try {
    logger.info("发送消息", { openid: target.openid, messageType, retryCount });
    
    // 优先使用客服接口 (更灵活，支持更多类型)
    const result = await sendViaCustomService(account, target.openid, content, messageType, retryCount);
    
    logger.info("消息发送成功", { openid: target.openid, messageId: result.messageId });
    return result;
  } catch (error: any) {
    logger.error("发送消息失败", { error: error.message, openid: target.openid, retryCount });
    
    // 重试机制 (最多重试3次)
    if (retryCount < 3 && shouldRetry(error)) {
      logger.warn("准备重试", { retryCount: retryCount + 1 });
      await sleep(1000 * (retryCount + 1)); // 指数退避
      return sendMessage(account, target, content, messageType, retryCount + 1);
    }
    
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
  messageType: string = "text",
  retryCount: number = 0
): Promise<{ messageId: string }> {
  const accessToken = await getAccessTokenWithRetry(account, retryCount);
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
      messageBody.video = { 
        media_id: content,
        thumb_media_id: content, // 需要缩略图，这里简化
        title: "",
        description: ""
      };
      break;
    case "music":
      messageBody.music = JSON.parse(content);
      break;
    case "news":
      messageBody.news = { 
        articles: JSON.parse(content)
      };
      break;
    case "mpnews":
      messageBody.mpnews = { 
        media_id: content
      };
      break;
    case "msgmenu":
      messageBody.msgmenu = JSON.parse(content);
      break;
    default:
      messageBody.text = { content };
      logger.warn("未知消息类型，使用文本类型", { messageType });
  }
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messageBody),
  }) as any;
  
  const result = await response.json() as any;
  
  if (result.errcode !== 0) {
    // 处理常见错误
    if (result.errcode === 45015) {
      // 48小时窗口过期
      throw new Error("用户已超过48小时未互动，无法主动推送消息");
    } else if (result.errcode === 45009) {
      // 接口调用超过限制
      throw new Error("客服接口调用次数达到上限，请稍后再试");
    } else if (result.errcode === 40001) {
      // access_token无效，需要重试
      throw new Error("access_token无效，需要重新获取");
    } else if (result.errcode === 42001) {
      // access_token过期
      throw new Error("access_token已过期，需要重新获取");
    }
    throw new Error(`客服接口错误 (${result.errcode}): ${result.errmsg}`);
  }
  
  return { messageId: result.msgid || `${Date.now()}` };
}

/**
 * 生成被动回复XML (用于5秒窗口内的同步回复)
 * @param account - 微信账户配置
 * @param toOpenid - 接收方OpenID (用户)
 * @param fromOpenid - 发送方OpenID (公众号)
 * @param content - 回复内容
 * @param messageType - 消息类型
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
      xmlContent = `<xml>
  <ToUserName><![CDATA[${toOpenid}]]></ToUserName>
  <FromUserName><![CDATA[${fromOpenid}]]></FromUserName>
  <CreateTime>${timestamp}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${content}]]></Content>
</xml>`;
      break;
    case "image":
      xmlContent = `<xml>
  <ToUserName><![CDATA[${toOpenid}]]></ToUserName>
  <FromUserName><![CDATA[${fromOpenid}]]></FromUserName>
  <CreateTime>${timestamp}</CreateTime>
  <MsgType><![CDATA[image]]></MsgType>
  <Image>
    <MediaId><![CDATA[${content}]]></MediaId>
  </Image>
</xml>`;
      break;
    case "voice":
      xmlContent = `<xml>
  <ToUserName><![CDATA[${toOpenid}]]></ToUserName>
  <FromUserName><![CDATA[${fromOpenid}]]></FromUserName>
  <CreateTime>${timestamp}</CreateTime>
  <MsgType><![CDATA[voice]]></MsgType>
  <Voice>
    <MediaId><![CDATA[${content}]]></MediaId>
  </Voice>
</xml>`;
      break;
    case "video":
      xmlContent = `<xml>
  <ToUserName><![CDATA[${toOpenid}]]></ToUserName>
  <FromUserName><![CDATA[${fromOpenid}]]></FromUserName>
  <CreateTime>${timestamp}</CreateTime>
  <MsgType><![CDATA[video]]></MsgType>
  <Video>
    <MediaId><![CDATA[${content}]]></MediaId>
    <Title><![CDATA[]]></Title>
    <Description><![CDATA[]]></Description>
  </Video>
</xml>`;
      break;
    case "music":
      const musicData = JSON.parse(content);
      xmlContent = `<xml>
  <ToUserName><![CDATA[${toOpenid}]]></ToUserName>
  <FromUserName><![CDATA[${fromOpenid}]]></FromUserName>
  <CreateTime>${timestamp}</CreateTime>
  <MsgType><![CDATA[music]]></MsgType>
  <Music>
    <Title><![CDATA[${musicData.title || ''}]]></Title>
    <Description><![CDATA[${musicData.description || ''}]]></Description>
    <MusicUrl><![CDATA[${musicData.musicUrl || ''}]]></MusicUrl>
    <HQMusicUrl><![CDATA[${musicData.hqMusicUrl || ''}]]></HQMusicUrl>
  </Music>
</xml>`;
      break;
    case "news":
      const newsData = JSON.parse(content);
      let articlesXML = "";
      for (const item of newsData.articles || []) {
        articlesXML += `
    <item>
      <Title><![CDATA[${item.title || ''}]]></Title>
      <Description><![CDATA[${item.description || ''}]]></Description>
      <PicUrl><![CDATA[${item.picUrl || ''}]]></PicUrl>
      <Url><![CDATA[${item.url || ''}]]></Url>
    </item>`;
      }
      xmlContent = `<xml>
  <ToUserName><![CDATA[${toOpenid}]]></ToUserName>
  <FromUserName><![CDATA[${fromOpenid}]]></FromUserName>
  <CreateTime>${timestamp}</CreateTime>
  <MsgType><![CDATA[news]]></MsgType>
  <ArticleCount>${newsData.articles?.length || 0}</ArticleCount>
  <Articles>${articlesXML}
  </Articles>
</xml>`;
      break;
    default:
      // 默认使用文本回复
      xmlContent = `<xml>
  <ToUserName><![CDATA[${toOpenid}]]></ToUserName>
  <FromUserName><![CDATA[${fromOpenid}]]></FromUserName>
  <CreateTime>${timestamp}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${content}]]></Content>
</xml>`;
  }
  
  // 如果需要加密 (安全模式)，则加密XML
  const config = loadConfig();
  if (config.wechat.encodingAESKey) {
    return encryptMessage(xmlContent, account.encodingAESKey, account.appId);
  }
  
  return xmlContent;
}

/**
 * 发送被动回复 (在POST响应中返回)
 */
export function sendPassiveReply(
  account: WeChatAccount,
  toOpenid: string,
  fromOpenid: string,
  content: string,
  messageType: string = "text"
): string {
  return generatePassiveReplyXML(account, toOpenid, fromOpenid, content, messageType);
}

/**
 * 判断错误是否应该重试
 */
function shouldRetry(error: any): boolean {
  const retryableErrors = [
    "timeout",
    "ETIMEDOUT",
    "ECONNRESET",
    "ESOCKETTIMEDOUT",
    "access_token无效",
    "access_token已过期"
  ];
  
  const errorMsg = error.message || error.toString();
  return retryableErrors.some(msg => errorMsg.includes(msg));
}

/**
 * 睡眠函数 (用于重试延迟)
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 消息类型映射 (OpenClaw → 微信)
 */
function mapToWeChatMsgType(type: string): string {
  const typeMap: Record<string, string> = {
    "text": "text",
    "image": "image",
    "voice": "voice",
    "video": "video",
    "music": "music",
    "news": "news",
    "mpnews": "mpnews",
    "msgmenu": "msgmenu",
  };
  return typeMap[type] || "text";
}

/**
 * 发送文本消息 (便捷方法)
 */
export async function sendTextMessage(
  account: WeChatAccount,
  openid: string,
  content: string
): Promise<{ messageId: string }> {
  return sendMessage(account, { openid }, content, "text");
}

/**
 * 发送图片消息 (便捷方法)
 */
export async function sendImageMessage(
  account: WeChatAccount,
  openid: string,
  mediaId: string
): Promise<{ messageId: string }> {
  return sendMessage(account, { openid }, mediaId, "image");
}

/**
 * 发送语音消息 (便捷方法)
 */
export async function sendVoiceMessage(
  account: WeChatAccount,
  openid: string,
  mediaId: string
): Promise<{ messageId: string }> {
  return sendMessage(account, { openid }, mediaId, "voice");
}

/**
 * 发送视频消息 (便捷方法)
 */
export async function sendVideoMessage(
  account: WeChatAccount,
  openid: string,
  mediaId: string
): Promise<{ messageId: string }> {
  return sendMessage(account, { openid }, mediaId, "video");
}
