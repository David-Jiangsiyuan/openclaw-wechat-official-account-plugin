# OpenClaw 微信公众号客服助手插件 (OAPlugin v2.0)

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/David-Jiangsiyuan/openclaw-wechat-official-account-plugin)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/David-Jiangsiyuan/openclaw-wechat-official-account-plugin/blob/main/LICENSE)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-orange.svg)](https://github.com/openclaw)

**2.0版本重大更新**：
- **OAPlugin**：标准 OpenClaw 扩展插件，与核心深度集成
- **OAGateway**：微信公众号对接服务，与 OpenClaw 同机部署
- **简化架构**：本地通信，避免网络复杂性，提升安全性

## 系统架构

```
微信用户 → 微信服务器 → OAGateway (localhost:8080) → OAPlugin → OpenClaw Core
```

**部署方式**：
- OAGateway 与 OpenClaw 部署在同一台服务器
- 本地回环通信（127.0.0.1），无需开放外部端口
- 简化防火墙配置，提升安全性

## 交付件

| 组件 | 类型 | 说明 |
|------|------|------|
| **OAPlugin** | OpenClaw 扩展插件 | 标准插件安装，通过 `openclaw plugin install` 安装 |
| **OAGateway** | 独立服务 | 与 OpenClaw 同机部署，监听 8080 端口 |

## 安装步骤

### 1. 安装 OAPlugin（OpenClaw 插件）

```bash
openclaw plugin install openclaw-wechat
```

### 2. 配置 OAGateway

```bash
cp config/wechat-config.template.json config/wechat-config.json
# 编辑配置，填写微信公众号信息
```

### 3. 启动服务

```bash
# OpenClaw 会自动启动 OAGateway
openclaw plugin start wechat
```

## 配置说明

### 微信公众号配置

| 配置项 | 说明 | 获取方式 |
|--------|------|----------|
| appId | 公众号 AppID | 微信公众平台 |
| appSecret | 公众号 AppSecret | 微信公众平台 |
| token | 开发者 Token | 自定义 |
| encodingAESKey | 消息加解密密钥 | 随机生成 |

### 服务器配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| host | 127.0.0.1 | 监听地址（本地） |
| port | 8080 | OAGateway 端口 |

## 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| **运行时** | Node.js 18+ | 与 OpenClaw 核心一致 |
| **开发语言** | TypeScript 5+ | 类型安全 |
| **HTTP 服务器** | Express 4.x | OAGateway |
| **XML 处理** | xml2js | 微信消息解析 |
| **HTTP 客户端** | axios | 微信 API 调用 |
| **配置管理** | dotenv + JSON | 环境变量 + 配置文件 |
| **加解密** | crypto (Node.js 内置) | AES-256-CBC |
| **日志** | winston | 结构化日志 |

## 故障排查

### 问题1：微信服务器验证失败

**症状**：公众平台配置 URL 时提示"验证失败"

**解决**：
1. 确认 OAGateway 已启动（`curl http://localhost:8080/health`）
2. 检查 Token 是否一致
3. 确认端口 8080 未被占用

### 问题2：消息接收失败

**症状**：用户发消息，无回复

**解决**：
1. 检查 OAGateway 日志
2. 确认 EncodingAESKey 正确
3. 检查 OpenClaw 插件是否已启用

### 问题3：客服接口调用失败

**症状**：日志显示"客服接口调用失败"

**常见错误码**：
- **40001**：access_token 无效，重新获取
- **45015**：用户超过 48 小时未互动
- **45009**：接口调用超过限制

## 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情

## 联系方式

- **项目主页**：https://github.com/David-Jiangsiyuan/openclaw-wechat-official-account-plugin
- **问题反馈**：https://github.com/David-Jiangsiyuan/openclaw-wechat-official-account-plugin/issues

---

**由 OpenClaw Team 开发和维护**

*最后更新: 2026-05-10*
