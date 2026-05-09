/**
 * OpenClaw 微信公众号插件 - XML解析工具
 * 
 * 解析微信消息XML格式
 */

import xml2js from "xml2js";
import { WeChatInboundMessage } from "../types";

/**
 * 解析微信XML消息
 */
export function parseWeChatXML(xmlString: string): WeChatInboundMessage {
  let result: WeChatInboundMessage;
  
  // 同步解析XML (xml2js默认是异步的，这里用Promise包装)
  const parsePromise = new Promise<WeChatInboundMessage>((resolve, reject) => {
    xml2js.parseString(xmlString, { trim: true, explicitArray: false }, (err: any, parsed: any) => {
      if (err) {
        reject(new Error(`XML解析失败: ${err.message}`));
        return;
      }
      
      // 微信XML格式: <xml><ToUserName><![CDATA[...]]></ToUserName>...</xml>
      const xml = parsed.xml;
      
      const message: WeChatInboundMessage = {
        ToUserName: getCDataContent(xml.ToUserName),
        FromUserName: getCDataContent(xml.FromUserName),
        CreateTime: xml.CreateTime?.[0] || xml.CreateTime || "",
        MsgType: getCDataContent(xml.MsgType),
        Content: xml.Content ? getCDataContent(xml.Content) : undefined,
        MsgId: xml.MsgId?.[0] || xml.MsgId || undefined,
        MediaId: xml.MediaId ? getCDataContent(xml.MediaId) : undefined,
        MediaUrl: xml.MediaUrl ? getCDataContent(xml.MediaUrl) : undefined,
        Format: xml.Format ? getCDataContent(xml.Format) : undefined,
        Recognition: xml.Recognition ? getCDataContent(xml.Recognition) : undefined,
        ThumbMediaId: xml.ThumbMediaId ? getCDataContent(xml.ThumbMediaId) : undefined,
        Location_X: xml.Location_X?.[0] || xml.Location_X || undefined,
        Location_Y: xml.Location_Y?.[0] || xml.Location_Y || undefined,
        Scale: xml.Scale?.[0] || xml.Scale || undefined,
        Label: xml.Label ? getCDataContent(xml.Label) : undefined,
        Title: xml.Title ? getCDataContent(xml.Title) : undefined,
        Description: xml.Description ? getCDataContent(xml.Description) : undefined,
        Url: xml.Url ? getCDataContent(xml.Url) : undefined,
        Event: xml.Event ? getCDataContent(xml.Event) : undefined,
        EventKey: xml.EventKey ? getCDataContent(xml.EventKey) : undefined,
      };
      
      resolve(message);
    });
  });
  
  // 由于xml2js是异步的，这里需要使用回调函数
  // 为了简化，我们在实际使用时应该使用异步方式
  throw new Error("parseWeChatXML需要使用异步方式，请使用parseWeChatXMLAsync");
}

/**
 * 异步解析微信XML消息
 */
export async function parseWeChatXMLAsync(xmlString: string): Promise<WeChatInboundMessage> {
  const parsed = await xml2js.parseStringPromise(xmlString, { trim: true, explicitArray: false });
  
  const xml = parsed.xml;
  
  const message: WeChatInboundMessage = {
    ToUserName: getCDataContent(xml.ToUserName),
    FromUserName: getCDataContent(xml.FromUserName),
    CreateTime: xml.CreateTime?.[0] || xml.CreateTime || "",
    MsgType: getCDataContent(xml.MsgType),
    Content: xml.Content ? getCDataContent(xml.Content) : undefined,
    MsgId: xml.MsgId?.[0] || xml.MsgId || undefined,
    MediaId: xml.MediaId ? getCDataContent(xml.MediaId) : undefined,
    MediaUrl: xml.MediaUrl ? getCDataContent(xml.MediaUrl) : undefined,
    Format: xml.Format ? getCDataContent(xml.Format) : undefined,
    Recognition: xml.Recognition ? getCDataContent(xml.Recognition) : undefined,
    ThumbMediaId: xml.ThumbMediaId ? getCDataContent(xml.ThumbMediaId) : undefined,
    Location_X: xml.Location_X?.[0] || xml.Location_X || undefined,
    Location_Y: xml.Location_Y?.[0] || xml.Location_Y || undefined,
    Scale: xml.Scale?.[0] || xml.Scale || undefined,
    Label: xml.Label ? getCDataContent(xml.Label) : undefined,
    Title: xml.Title ? getCDataContent(xml.Title) : undefined,
    Description: xml.Description ? getCDataContent(xml.Description) : undefined,
    Url: xml.Url ? getCDataContent(xml.Url) : undefined,
    Event: xml.Event ? getCDataContent(xml.Event) : undefined,
    EventKey: xml.EventKey ? getCDataContent(xml.EventKey) : undefined,
  };
  
  return message;
}

/**
 * 提取CDATA内容
 */
function getCDataContent(value: any): string {
  if (!value) return "";
  
  // 如果值是对象 (包含CDATA)
  if (typeof value === "object") {
    return value._ || value["#text"] || value["$"] || JSON.stringify(value);
  }
  
  return String(value);
}

/**
 * 生成微信XML响应
 */
export function generateWeChatXML(params: {
  toUserName: string;
  fromUserName: string;
  createTime: number;
  msgType: string;
  content: string;
}): string {
  const { toUserName, fromUserName, createTime, msgType, content } = params;
  
  return `
<xml>
  <ToUserName><![CDATA[${toUserName}]]></ToUserName>
  <FromUserName><![CDATA[${fromUserName}]]></FromUserName>
  <CreateTime>${createTime}</CreateTime>
  <MsgType><![CDATA[${msgType}]]></MsgType>
  <Content><![CDATA[${content}]]></Content>
</xml>
  `.trim();
}
