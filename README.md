# OpenClaw 微信公众号客服助手插件

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/David-Jiangsiyuan/openclaw-wechat-official-account-plugin)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/David-Jiangsiyuan/openclaw-wechat-official-account-plugin/blob/main/LICENSE)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-orange.svg)](https://github.com/openclaw)

OpenClaw 微信公众号客服助手插件，为微信公众号提供智能客服能力，支持自动回复、知识库查询、多轮对话等功能。

## 📖 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [安装步骤](#安装步骤)
- [配置指南](#配置指南)
- [使用说明](#使用说明)
- [开发指南](#开发指南)
- [故障排查](#故障排查)
- [许可证](#许可证)

## 🎯 功能特性

- ✅ **智能对话**: 基于OpenClaw AI引擎，提供智能客服回复
- ✅ **知识库集成**: 支持对接OpenClaw知识库，提供精准答案
- ✅ **多轮对话**: 自动维护对话上下文，支持连贯对话
- ✅ **消息加密**: 支持微信安全模式消息加解密(AES-256-CBC)
- ✅ **多种消息类型**: 支持文本、图片、语音、视频等消息类型
- ✅ **异步处理**: 智能处理5秒超时限制，自动选择最优回复方式
- ✅ **结构化日志**: 使用Winston进行完整的日志记录
- ✅ **配置管理**: 支持环境变量和配置文件两种方式

## 🛠 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| **运行时** | Node.js 18+ | 与OpenClaw核心一致 |
| **开发语言** | TypeScript 5+ | 类型安全，易维护 |
| **HTTP服务器** | Express 4.x | 轻量级，生态丰富 |
| **XML处理** | xml2js | 解析微信消息 |
| **HTTP客户端** | axios | 调用微信API |
| **配置管理** | dotenv + JSON | 环境变量 + 配置文件 |
| **加解密** | crypto (Node.js内置) | AES-256-CBC |
| **日志** | winston | 结构化日志 |

## 📦 安装步骤

### 方式一：通过OpenClaw CLI安装（推荐）

```bash
# 安装插件
openclaw plugin install openclaw-wechat

# 启用插件
openclaw plugin enable wechat

# 启动插件
openclaw plugin start wechat
```

### 方式二：手动安装

```bash
# 1. 下载插件包
wget https://github.com/David-Jiangsiyuan/openclaw-wechat-official-account-plugin/releases/download/v1.0.0/openclaw-wechat-1.0.0.tgz

# 2. 解压到插件目录
tar -xzf openclaw-wechat-1.0.0.tgz -C ~/.openclaw/plugins/

# 3. 安装依赖
cd ~/.openclaw/plugins/openclaw-wechat
npm install

# 4. 编译TypeScript
npm run build
```

### 方式三：从源码安装

```bash
# 1. 克隆仓库
git clone https://github.com/David-Jiangsiyuan/openclaw-wechat-official-account-plugin.git
cd openclaw-wechat-official-account-plugin

# 2. 安装依赖
npm install

# 3. 编译TypeScript
npm run build

# 4. 链接到OpenClaw
npm link
```

## ⚙️ 配置指南

### 第一步：获取微信公众号凭证

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入"设置与开发" > "基本配置"
3. 获取以下信息：
   - **开发者ID(AppID)**: 公众号的唯一标识
   - **开发者密码(AppSecret)**: 需要管理员扫码查看
   - **Token**: 自定义一个字符串（建议随机生成）
   - **EncodingAESKey**: 点击"生成"按钮生成43位密钥

### 第二步：配置插件

1. **复制配置模板**:

```bash
cd ~/.openclaw/plugins/openclaw-wechat
cp config/wechat-config.template.json config/wechat-config.json
cp config/.env.wechat.template config/.env.wechat
```

2. **编辑环境变量文件** (`config/.env.wechat`):

```bash
# 服务器配置
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
SERVER_PUBLIC_URL=https://your-domain.com/wx/webhook

# 微信公众号配置
WECHAT_APP_ID=你的AppID
WECHAT_APP_SECRET=你的AppSecret
WECHAT_TOKEN=你的Token
WECHAT_ENCODING_AES_KEY=你的EncodingAESKey

# OpenClaw配置
OPENCLAW_KNOWLEDGE_BASE_ID=你的知识库ID
OPENCLAW_API_TIMEOUT=10000
```

3. **编辑配置文件** (`config/wechat-config.json`):

```json
{
  "version": "1.0.0",
  "server": {
    "host": "0.0.0.0",
    "port": 8080,
    "publicUrl": "https://your-domain.com/wx/webhook"
  },
  "wechat": {
    "appId": "你的AppID",
    "appSecret": "你的AppSecret",
    "token": "你的Token",
    "encodingAESKey": "你的EncodingAESKey"
  },
  "openclaw": {
    "knowledgeBaseId": "你的知识库ID",
    "apiTimeout": 10000
  }
}
```

### 第三步：配置微信公众平台

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入"设置与开发" > "基本配置"
3. 点击"修改配置"
4. 填写以下信息：
   - **URL**: 你的公网可访问URL (例如: https://your-domain.com/wx/webhook)
   - **Token**: 与配置文件中一致的Token
   - **EncodingAESKey**: 与配置文件中一致的43位密钥
   - **消息加解密方式**: 选择"安全模式"
5. 点击"提交"进行验证
6. 验证通过后，点击"启用"服务器配置

### 第四步：启动插件

```bash
# 启动插件
openclaw plugin start wechat

# 查看状态
openclaw plugin status wechat

# 查看日志
tail -f ~/.openclaw/plugins/openclaw-wechat/logs/combined.log
```

## 📖 使用说明

### 基本使用

1. 用户关注微信公众号
2. 用户发送消息
3. 插件自动接收消息并转发给OpenClaw处理
4. OpenClaw生成智能回复
5. 插件将回复发送给用户

### 支持的消息类型

- ✅ **文本消息**: 用户发送文本，AI智能回复
- ✅ **图片消息**: 接收图片，可进行分析（需配置）
- ✅ **语音消息**: 接收语音，自动转文字后处理
- ✅ **视频消息**: 接收视频消息
- ✅ **事件消息**: 关注/取关等事件通知

### 回复方式

插件智能选择回复方式：

1. **被动回复** (5秒内): 直接在HTTP响应中返回回复内容
2. **客服接口** (48小时内): 异步推送回复，支持更长时间处理

## 💻 开发指南

### 项目结构

```
openclaw-wechat/
├── openclaw.plugin.json          # 插件元数据
├── package.json                  # npm包描述
├── tsconfig.json                 # TypeScript配置
├── README.md                     # 安装使用说明
├── src/
│   ├── channel.ts                # 主入口 (ChannelPlugin接口)
│   ├── gateway.ts                # HTTP服务器 (接收微信推送)
│   ├── crypto.ts                 # 消息加解密 (AES-256-CBC)
│   ├── inbound.ts                # 接收消息处理 (XML→OpenClaw)
│   ├── outbound.ts               # 发送消息 (OpenClaw→微信)
│   ├── config.ts                 # 配置管理
│   ├── runtime.ts                # 运行时管理
│   ├── types.ts                  # TypeScript类型定义
│   ├── wechat-api.ts             # 微信API封装
│   └── utils/
│       ├── signature.ts          # 签名验证
│       ├── xml-parser.ts         # XML解析工具
│       └── logger.ts             # 日志工具
├── config/
│   ├── wechat-config.template.json   # 配置模板
│   └── .env.wechat.template         # 环境变量模板
├── dist/                         # 编译输出
└── tests/                        # 测试文件
```

### 从QQ Bot插件修改而来

如果你想基于QQ Bot插件进行修改，主要需要修改以下文件：

1. **channel.ts**: 修改插件ID、名称、能力声明
2. **gateway.ts**: 修改路由路径、消息格式
3. **crypto.ts**: 实现微信特有的AES-256-CBC加解密
4. **inbound.ts**: 修改消息格式转换逻辑
5. **outbound.ts**: 修改消息发送逻辑
6. **types.ts**: 修改类型定义

### 开发流程

```bash
# 1. 安装依赖
npm install

# 2. 开发模式 (自动编译)
npm run dev

# 3. 构建
npm run build

# 4. 运行测试
npm run test

# 5. 代码检查
npm run lint
```

### 调试技巧

1. **使用微信测试号**: 在公众平台注册测试号，避免影响生产环境
2. **查看日志**: `tail -f logs/combined.log`
3. **使用ngrok**: 本地开发时使用ngrok提供公网访问
   ```bash
   ngrok http 8080
   ```
4. **验证签名**: 使用微信提供的[消息校验工具](https://mp.weixin.qq.com/debug/cgi-bin/apiinfo?t=index&type=type&form=form&senior=advanced&admin=file)

## 🔧 故障排查

### 问题1：微信服务器验证失败

**症状**: 在微信公众平台配置URL时，提示"验证失败"

**解决方法**:
1. 检查Token是否一致
2. 检查服务器是否可公网访问
3. 查看日志 `logs/error.log`
4. 使用curl测试验证接口:
   ```bash
   curl "http://your-domain.com/wx/webhook?signature=xxx&timestamp=xxx&nonce=xxx&echostr=xxx"
   ```

### 问题2：消息接收失败

**症状**: 用户发送消息，公众号无回复

**解决方法**:
1. 检查EncodingAESKey是否正确
2. 检查消息加解密方式是否配置为"安全模式"
3. 查看日志，确认消息是否成功解密
4. 检查OpenClaw API是否可访问

### 问题3：客服接口调用失败

**症状**: 日志显示"客服接口调用失败"

**常见错误码**:
- **40001**: access_token无效，尝试重新获取
- **45015**: 用户超过48小时未互动，无法主动推送
- **45009**: 接口调用超过限制

**解决方法**:
1. 检查AppID和AppSecret是否正确
2. 确认用户近期有主动发送消息
3. 检查API调用频率是否过高

### 问题4：配置验证失败

**症状**: 启动插件时提示"配置验证失败"

**解决方法**:
1. 检查所有必填项是否已填写
2. 检查EncodingAESKey是否为43位
3. 检查配置文件格式是否正确(JSON格式)
4. 运行配置验证脚本:
   ```bash
   node dist/scripts/validate-config.js
   ```

### 问题5：编译错误

**症状**: 运行 `npm run build` 时出现TypeScript编译错误

**解决方法**:
1. 检查Node.js版本是否为18+
2. 检查TypeScript版本是否为5+
3. 删除 `node_modules` 和 `package-lock.json`，重新安装:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
4. 检查 `tsconfig.json` 配置是否正确

## 📝 常见问题

### Q1: 可以使用测试号进行测试吗？

**A**: 可以。在[微信公众平台](https://mp.weixin.qq.com/)注册测试号，获得测试用的AppID和AppSecret。

### Q2: 支持多个微信公众号吗？

**A**: 当前版本仅支持单个公众号。多公众号支持将在后续版本中提供。

### Q3: 如何升级插件？

**A**: 
```bash
# 方式一：通过CLI升级
openclaw plugin update wechat

# 方式二：手动升级
cd ~/.openclaw/plugins/openclaw-wechat
npm update openclaw-wechat
npm run build
```

### Q4: 消息处理超时怎么办？

**A**: 插件采用异步处理机制：
1. 5秒内：使用被动回复
2. 超过5秒：先返回success，再通过客服接口异步回复

### Q5: 如何查看API调用日志？

**A**: 日志文件位于 `logs/` 目录：
- `logs/combined.log`: 综合日志
- `logs/error.log`: 错误日志

## 🤝 贡献指南

欢迎提交Issue和Pull Request！

1. Fork本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交Pull Request

## 📄 许可证

本项目采用MIT许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📧 联系方式

- **项目主页**: https://github.com/David-Jiangsiyuan/openclaw-wechat-official-account-plugin
- **问题反馈**: https://github.com/David-Jiangsiyuan/openclaw-wechat-official-account-plugin/issues
- **邮件联系**: support@openclaw.com

---

**由 OpenClaw Team 开发和维护**

*最后更新: 2026-05-09*
