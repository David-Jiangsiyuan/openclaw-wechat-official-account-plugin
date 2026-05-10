# OpenClaw 微信公众号插件 v2.1.0

## 架构变更说明

### v2.1.0 重大变更

**移除 OAPlugin 独立服务**，OAGateway 直接集成 OpenClaw QA Bus API：

```
用户微信消息 → OAGateway → injectQaBusInboundMessage → OpenClaw Core (AI处理)
                                                     ↓
用户微信消息 ← OAGateway ← pollQaBus (获取回复) ←─┘
```

**变更原因**：
- OAPlugin 作为标准插件无法直接处理外部消息
- OpenClaw 提供 QA Bus API 供外部注入消息
- 简化架构，减少维护成本

### 当前架构

**OAGateway (v2.1.0)**：
- 接收微信服务器推送的消息
- 直接调用 `injectQaBusInboundMessage` 将消息注入 OpenClaw
- 使用 `pollQaBus` 获取 OpenClaw 的 AI 回复
- 通过微信公众号客服接口发送回复给用户

**OpenClaw Core**：
- 接收 QA Bus 消息
- AI 处理并生成回复
- 通过 QA Bus 返回回复

## 配置说明

### 环境变量 (.env.wechat)

```bash
# 微信配置
WECHAT_APP_ID=your_app_id
WECHAT_APP_SECRET=your_app_secret
WECHAT_TOKEN=your_token
WECHAT_ENCODING_AES_KEY=your_encoding_aes_key

# OpenClaw 配置
OPENCLAW_API_URL=http://127.0.0.1:25265
OPENCLAW_ACCOUNT_ID=a366989004a7-im-bot
```

### 配置文件 (wechat-config.json)

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 80,
    "publicUrl": "http://your-domain:80/wx/webhook"
  },
  "wechat": {
    "appId": "your_app_id",
    "appSecret": "your_app_secret",
    "token": "your_token",
    "encodingAESKey": ""
  },
  "openclaw": {
    "apiUrl": "http://127.0.0.1:25265",
    "accountId": "a366989004a7-im-bot"
  }
}
```

## 部署说明

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `config/.env.wechat.template` 为 `config/.env.wechat` 并填写配置。

### 3. 编译

```bash
npm run build
```

### 4. 启动

```bash
node dist/server.js
```

### 5. 配置微信公众号

在微信公众号后台配置服务器 URL：
- URL: `http://your-domain:80/wx/webhook`
- Token: 与配置文件中一致

## API 说明

### 健康检查

```
GET /health
```

### 接收微信消息

```
POST /wx/webhook
Content-Type: text/xml
```

### 接收 OpenClaw 回复

```
POST /wx/reply
Authorization: Bearer {authToken}
Content-Type: application/json

{
  "openid": "user_openid",
  "content": "回复内容",
  "msgType": "text"
}
```

## 版本历史

### v2.1.0 (2026-05-10)
- 移除 OAPlugin 独立服务
- OAGateway 直接集成 OpenClaw QA Bus API
- 简化架构，减少维护成本

### v2.0.5 (2026-05-10)
- 修复直接消息处理问题
- 测试模式工作正常

### v2.0.0 (2026-05-10)
- 初始版本
- OAGateway + OAPlugin 架构
