# OpenClaw 微信插件 - 部署与配置管理方案

**文档版本**: v1.0  
**编写日期**: 2026-05-09  
**目的**: 详细设计插件的部署流程、配置管理和安装机制  

---

## 一、部署架构概述

### 1.1 部署拓扑

```
【开发环境】
  Developer Machine
  └── 开发插件代码
      └── 本地测试（可选）

【构建环境】
  CI/CD (可选)
  └── 编译TypeScript → JavaScript
  └── 打包插件（npm pack）
  └── 生成配置文件模板

【生产环境】
  OpenClaw服务器
  └── OpenClaw核心
  └── 插件目录
      └── openclaw-wechat/
          ├── openclaw.plugin.json
          ├── dist/           # 编译后的JS
          ├── config/         # 配置文件
          └── package.json
  └── OpenClaw配置
      └── config.yaml       # 全局配置（包含微信配置）
```

---

## 二、配置文件设计

### 2.1 配置文件结构

**插件需要以下配置信息**：

| 配置项 | 说明 | 获取方式 | 是否敏感 |
|--------|------|----------|----------|
| **服务器配置** | | | |
| `server.host` | 服务器IP/域名 | 安装时输入 | 否 |
| `server.port` | HTTP服务器端口 | 安装时输入（默认8080） | 否 |
| `server.publicUrl` | 公网可访问的URL | 安装时输入 | 否 |
| **微信公众号配置** | | | |
| `wechat.appId` | 公众号AppID | 管理员提供 | 否 |
| `wechat.appSecret` | 公众号AppSecret | 管理员提供 | ✅ 是 |
| `wechat.token` | 开发者Token（自定义） | 安装时生成或输入 | ✅ 是 |
| `wechat.encodingAESKey` | 消息加解密密钥 | 安装时生成或输入 | ✅ 是 |
| **OpenClaw配置** | | | |
| `openclaw.apiTimeout` | API超时时间（ms） | 安装时输入（默认5000） | 否 |

---

### 2.2 配置文件格式

#### 方案A：JSON格式（推荐）

**文件**: `config/wechat-config.json`

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8080,
    "publicUrl": "https://openclaw.yourdomain.com/wx/webhook"
  },
  "wechat": {
    "appId": "wx1234567890abcdef",
    "appSecret": "YOUR_APP_SECRET_HERE",
    "token": "openclaw2026",
    "encodingAESKey": "YOUR_AES_KEY_HERE"
  },
  "openclaw": {
    "apiTimeout": 5000
  }
}
```

**注意**：知识库功能由OpenClaw核心统一管理，插件无需单独配置知识库ID。

**优点**：
- ✅ 易读易编辑
- ✅ 广泛支持（所有编程语言）
- ✅ 支持注释（使用`//`或`/* */`，需要自定义解析）

**缺点**：
- ❌ 不支持注释（标准JSON）
- ❌ 敏感信息明文存储（需要加密方案）

---

#### 方案B：YAML格式

**文件**: `config/wechat-config.yaml`

```yaml
# 服务器配置
server:
  host: "0.0.0.0"
  port: 8080
  publicUrl: "https://openclaw.yourdomain.com/wx/webhook"

# 微信公众号配置
wechat:
  appId: "wx1234567890abcdef"
  appSecret: "YOUR_APP_SECRET_HERE"
  token: "openclaw2026"
  encodingAESKey: "YOUR_AES_KEY_HERE"

# OpenClaw配置
openclaw:
  apiTimeout: 5000
```

**注意**：知识库功能由OpenClaw核心统一管理，插件无需单独配置。

**优点**：
- ✅ 支持注释
- ✅ 更易阅读（特别是复杂配置）
- ✅ 支持多行字符串

**缺点**：
- ❌ 需要额外依赖（yaml解析库）
- ❌ 缩进敏感（容易出错）

---

#### 方案C：环境变量 + .env文件（推荐用于敏感信息）

**文件**: `.env.wechat`

```bash
# 服务器配置
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
SERVER_PUBLIC_URL=https://openclaw.yourdomain.com/wx/webhook

# 微信公众号配置
WECHAT_APP_ID=wx1234567890abcdef
WECHAT_APP_SECRET=YOUR_APP_SECRET_HERE
WECHAT_TOKEN=openclaw2026
WECHAT_ENCODING_AES_KEY=YOUR_AES_KEY_HERE

# OpenClaw配置
OPENCLAW_API_TIMEOUT=5000
```

**注意**：知识库功能由OpenClaw核心统一管理。

**读取方式**（Node.js）：
```typescript
// src/config.ts
import dotenv from 'dotenv';
import path from 'path';

// 加载.env.wechat文件
dotenv.config({ path: path.join(__dirname, '../config/.env.wechat') });

export interface WeChatConfig {
  server: {
    host: string;
    port: number;
    publicUrl: string;
  };
  wechat: {
    appId: string;
    appSecret: string;
    token: string;
    encodingAESKey: string;
  };
  openclaw: {
    apiTimeout: number;
  };
}

export function loadConfig(): WeChatConfig {
  return {
    server: {
      host: process.env.SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.SERVER_PORT || '8080'),
      publicUrl: process.env.SERVER_PUBLIC_URL || '',
    },
    wechat: {
      appId: process.env.WECHAT_APP_ID || '',
      appSecret: process.env.WECHAT_APP_SECRET || '',
      token: process.env.WECHAT_TOKEN || '',
      encodingAESKey: process.env.WECHAT_ENCODING_AES_KEY || '',
    },
    openclaw: {
      apiTimeout: parseInt(process.env.OPENCLAW_API_TIMEOUT || '5000'),
    },
  };
}
```

**优点**：
- ✅ 敏感信息不进入版本控制（添加到`.gitignore`）
- ✅ 易读易编辑
- ✅ 广泛支持（Node.js有`dotenv`库）

**缺点**：
- ❌ 需要额外依赖（`dotenv`）
- ❌ 不支持复杂数据结构

---

### 2.3 推荐配置方案（组合方案）

**主配置文件**: `config/wechat-config.json`（非敏感配置）  
**环境变量文件**: `config/.env.wechat`（敏感配置）  
**配置模板**: `config/wechat-config.template.json`（安装时复制并填写）

#### 配置文件结构

```
openclaw-wechat/
├── config/
│   ├── wechat-config.template.json   # 配置模板（进入版本控制）
│   ├── wechat-config.json            # 实际配置文件（不进入版本控制）
│   └── .env.wechat                  # 敏感信息（不进入版本控制）
├── .gitignore                       # 忽略实际配置文件
└── ...
```

#### `.gitignore` 内容

```gitignore
# 忽略实际配置文件（包含敏感信息）
config/wechat-config.json
config/.env.wechat

# 保留模板文件
!config/wechat-config.template.json
```

---

## 三、插件安装流程设计

### 3.1 安装方式选择

#### 方案A：OpenClaw CLI安装（推荐）

**安装命令**：
```bash
# 从npm安装（公开插件）
openclaw plugin install openclaw-wechat

# 从本地文件安装
openclaw plugin install ./openclaw-wechat-1.0.0.tgz

# 从Git仓库安装
openclaw plugin install git+https://github.com/yourorg/openclaw-wechat.git
```

**安装流程**：
```
1. 用户输入安装命令
   ↓
2. OpenClaw CLI下载/解压插件
   ↓
3. 检查依赖（openclaw/plugin-sdk版本）
   ↓
4. 检查配置文件是否存在
   ↓ (不存在)
5. 启动交互式配置向导
   ↓
6. 生成配置文件
   ↓
7. 将插件添加到OpenClaw配置
   ↓
8. 启动插件（可选）
   ↓
9. 安装完成 ✅
```

---

#### 方案B：手动安装（备用方案）

**安装步骤**：
```
1. 下载插件包
   ↓
2. 解压到OpenClaw插件目录
   ↓
3. 运行npm install安装依赖
   ↓
4. 复制配置模板
   ↓
5. 编辑配置文件（填入实际值）
   ↓
6. 将插件添加到OpenClaw配置
   ↓
7. 重启OpenClaw
   ↓
8. 安装完成 ✅
```

---

### 3.2 交互式配置向导（重点！）

**目标**：在安装过程中，引导用户填写所有必需的配置项。

**实现方式**：OpenClaw CLI启动一个交互式问答流程。

#### 问答流程设计

```typescript
// scripts/install-wizard.ts
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';

export async function runInstallWizard() {
  console.log('欢迎安装 OpenClaw 微信插件！');
  console.log('请按照以下步骤填写配置信息。\n');

  // 步骤1：服务器配置
  console.log('【步骤1/3】服务器配置');
  const serverConfig = await inquirer.prompt([
    {
      type: 'input',
      name: 'host',
      message: '服务器监听地址（默认0.0.0.0）:',
      default: '0.0.0.0',
    },
    {
      type: 'number',
      name: 'port',
      message: '服务器端口（默认8080）:',
      default: 8080,
      validate: (input) => input > 0 && input < 65536 || '端口必须在1-65535之间',
    },
    {
      type: 'input',
      name: 'publicUrl',
      message: '公网可访问的URL（用于微信服务器配置）:',
      validate: (input) => input.startsWith('http') || '必须是以http://或https://开头',
    },
  ]);

  // 步骤2：微信公众号配置
  console.log('\n【步骤2/3】微信公众号配置');
  console.log('提示：这些信息可以从微信公众平台获取（需要管理员权限）\n');
  
  const wechatConfig = await inquirer.prompt([
    {
      type: 'input',
      name: 'appId',
      message: '微信公众号AppID:',
      validate: (input) => input.length > 0 || 'AppID不能为空',
    },
    {
      type: 'password',
      name: 'appSecret',
      message: '微信公众号AppSecret:',
      validate: (input) => input.length > 0 || 'AppSecret不能为空',
    },
    {
      type: 'input',
      name: 'token',
      message: '开发者Token（任意字符串，用于验证消息来源）:',
      default: () => generateRandomString(32),
    },
    {
      type: 'input',
      name: 'encodingAESKey',
      message: '消息加解密密钥（43位随机字符串）:',
      default: () => generateRandomString(43),
    },
  ]);

  // 步骤3：OpenClaw配置
  console.log('\n【步骤3/3】OpenClaw配置');
  const openclawConfig = await inquirer.prompt([
    {
      type: 'number',
      name: 'apiTimeout',
      message: 'API超时时间（毫秒，默认5000）:',
      default: 5000,
    },
  ]);

  // 生成配置文件
  const config = {
    server: serverConfig,
    wechat: wechatConfig,
    openclaw: openclawConfig,
  };
  
  // 注意：知识库功能由OpenClaw核心统一管理，插件无需单独配置

  const configPath = path.join(__dirname, '../config/wechat-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  // 生成环境变量文件（敏感信息）
  const envContent = `
# 服务器配置
SERVER_HOST=${serverConfig.host}
SERVER_PORT=${serverConfig.port}
SERVER_PUBLIC_URL=${serverConfig.publicUrl}

# 微信公众号配置
WECHAT_APP_ID=${wechatConfig.appId}
WECHAT_APP_SECRET=${wechatConfig.appSecret}
WECHAT_TOKEN=${wechatConfig.token}
WECHAT_ENCODING_AES_KEY=${wechatConfig.encodingAESKey}

# OpenClaw配置
OPENCLAW_API_TIMEOUT=${openclawConfig.apiTimeout}
  `.trim();

  const envPath = path.join(__dirname, '../config/.env.wechat');
  fs.writeFileSync(envPath, envContent);

  console.log('\n✅ 配置文件已生成：');
  console.log(`   - ${configPath}`);
  console.log(`   - ${envPath}`);
  console.log('\n⚠️  请注意：`);
  console.log('   1. 请将 config/.env.wechat 添加到 .gitignore');
  console.log('   2. 请妥善保管 AppSecret 和 EncodingAESKey');
  console.log('   3. 接下来需要在微信公众平台配置服务器\n');
}
```

---

### 3.3 安装后验证

**验证步骤**：
```typescript
// scripts/post-install-check.ts
export async function postInstallCheck() {
  console.log('正在验证安装...\n');

  // 1. 检查配置文件是否存在
  if (!fs.existsSync('./config/wechat-config.json')) {
    console.error('❌ 配置文件不存在，请运行安装向导');
    return false;
  }

  // 2. 检查敏感信息文件是否存在
  if (!fs.existsSync('./config/.env.wechat')) {
    console.error('❌ 环境变量文件不存在');
    return false;
  }

  // 3. 检查必要配置项是否填写
  const config = loadConfig();
  if (!config.wechat.appId || !config.wechat.appSecret) {
    console.error('❌ 微信公众号配置不完整');
    return false;
  }

  // 4. 测试服务器启动（不实际监听端口）
  try {
    const app = express();
    // 这里可以添加更多验证...
    console.log('✅ 服务器配置验证通过');
  } catch (err) {
    console.error('❌ 服务器配置验证失败:', err.message);
    return false;
  }

  // 5. 检查微信公众平台配置（可选）
  console.log('\n📋 接下来需要在微信公众平台完成配置：');
  console.log('   1. 登录 https://mp.weixin.qq.com/');
  console.log('   2. 进入"设置与开发" → "基本配置"');
  console.log('   3. 点击"修改配置"');
  console.log(`   4. 填写以下信息：`);
  console.log(`      - URL: ${config.server.publicUrl}`);
  console.log(`      - Token: ${config.wechat.token}`);
  console.log(`      - EncodingAESKey: ${config.wechat.encodingAESKey}`);
  console.log(`      - 消息加解密方式: 安全模式`);
  console.log('   5. 点击"保存"');
  console.log('   6. 启用服务器配置\n');

  return true;
}
```

---

## 四、插件打包方案

### 4.1 打包格式选择

#### 方案A：npm包（推荐）

**打包命令**：
```bash
# 编译TypeScript
npm run build

# 打包为.tgz文件
npm pack
# 生成 openclaw-wechat-1.0.0.tgz
```

**安装方式**：
```bash
# 从.tgz文件安装
openclaw plugin install ./openclaw-wechat-1.0.0.tgz

# 从npm registry安装（如果发布到npm）
npm install -g openclaw-wechat
openclaw plugin install openclaw-wechat
```

**优点**：
- ✅ 标准打包格式
- ✅ 支持版本管理
- ✅ 支持依赖管理
- ✅ 易于分发

---

#### 方案B：Docker镜像（适用于复杂依赖）

**Dockerfile**：
```dockerfile
FROM node:18-alpine

# 安装OpenClaw核心
RUN npm install -g openclaw@^1.0.0

# 安装微信插件
RUN openclaw plugin install openclaw-wechat

# 暴露插件端口
EXPOSE 8080

# 启动OpenClaw
CMD ["openclaw", "start"]
```

**优点**：
- ✅ 环境隔离
- ✅ 依赖预装
- ✅ 易于部署到云服务器

**缺点**：
- ❌ 镜像体积大
- ❌ 需要Docker环境

---

### 4.2 推荐打包流程

**package.json配置**：
```json
{
  "name": "openclaw-wechat",
  "version": "1.0.0",
  "description": "OpenClaw plugin for WeChat Official Account",
  "main": "dist/channel.js",
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build",
    "postinstall": "node scripts/post-install.js"
  },
  "keywords": ["openclaw", "plugin", "wechat"],
  "openclaw": {
    "pluginType": "channel",
    "minSdkVersion": "1.0.0"
  }
}
```

**打包命令**：
```bash
# 1. 编译TypeScript
npm run build

# 2. 生成配置模板
node scripts/generate-config-template.js

# 3. 打包
npm pack
# 输出：openclaw-wechat-1.0.0.tgz

# 4. 分发
# - 通过npm registry（如果公开）
# - 通过文件分享（如果私有）
```

---

## 五、配置管理最佳实践

### 5.1 配置版本管理

**问题**：配置文件可能随时间变化（如：更换服务器、更新AppSecret等）

**解决方案**：配置版本控制

**配置文件添加版本字段**：
```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-05-09T12:00:00Z",
  "server": { ... },
  "wechat": { ... }
}
```

**迁移脚本**（当配置格式变化时）：
```typescript
// scripts/migrate-config.ts
export async function migrateConfig(fromVersion: string, toVersion: string) {
  if (fromVersion === '1.0.0' && toVersion === '1.1.0') {
    // 示例：从1.0.0迁移到1.1.0
    // 变更：新增了`server.timeout`配置项
    const config = loadConfig();
    config.server.timeout = 30000;  // 默认值
    saveConfig(config);
    console.log('✅ 配置已迁移到1.1.0');
  }
}
```

---

### 5.2 敏感信息管理

**问题**：AppSecret、EncodingAESKey等敏感信息不能明文存储

**解决方案A**：环境变量 + .env文件（推荐）

已经在前面介绍过。

**解决方案B**：加密配置文件

```typescript
// src/config-crypto.ts
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || 'default-key-change-me';

export function encryptConfig(config: object): string {
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
  let encrypted = cipher.update(JSON.stringify(config));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString('base64');
}

export function decryptConfig(encrypted: string): object {
  const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
  let decrypted = decipher.update(Buffer.from(encrypted, 'base64'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return JSON.parse(decrypted.toString());
}
```

**使用方式**：
```bash
# 设置加密密钥（生产环境使用强密钥）
export CONFIG_ENCRYPTION_KEY=your-strong-encryption-key

# 加密配置文件
node scripts/encrypt-config.js

# 启动时解密
node dist/channel.js
```

---

### 5.3 配置验证

**问题**：配置错误会导致插件无法正常工作

**解决方案**：使用JSON Schema验证配置

**配置Schema**：
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["server", "wechat", "openclaw"],
  "properties": {
    "server": {
      "type": "object",
      "required": ["host", "port", "publicUrl"],
      "properties": {
        "host": { "type": "string" },
        "port": { "type": "number", "minimum": 1, "maximum": 65535 },
        "publicUrl": { "type": "string", "format": "uri" }
      }
    },
    "wechat": {
      "type": "object",
      "required": ["appId", "appSecret", "token", "encodingAESKey"],
      "properties": {
        "appId": { "type": "string", "minLength": 1 },
        "appSecret": { "type": "string", "minLength": 1 },
        "token": { "type": "string", "minLength": 3, "maxLength": 32 },
        "encodingAESKey": { "type": "string", "minLength": 43, "maxLength": 43 }
      }
    }
  }
}
```

**验证代码**：
```typescript
// src/config-validator.ts
import Ajv from 'ajv';

const ajv = new Ajv();
const validate = ajv.compile(require('./config-schema.json'));

export function validateConfig(config: object): boolean {
  const isValid = validate(config);
  if (!isValid) {
    console.error('配置验证失败:');
    console.error(validate.errors);
  }
  return isValid;
}
```

---

## 六、完整部署流程（总结）

### 6.1 开发阶段

```
1. 开发插件代码
   ↓
2. 本地测试（可选）
   ↓
3. 编译TypeScript → JavaScript
   ↓
4. 生成配置模板
   ↓
5. 打包为openclaw-wechat-1.0.0.tgz
```

---

### 6.2 部署到生产环境

```
1. 将插件包传输到OpenClaw服务器
   ↓
2. 运行安装命令
   openclaw plugin install ./openclaw-wechat-1.0.0.tgz
   ↓
3. 交互式配置向导启动
   - 输入服务器配置
   - 输入微信公众号配置
   - 输入OpenClaw配置
   ↓
4. 生成配置文件
   config/wechat-config.json
   config/.env.wechat
   ↓
5. 安装后验证
   - 检查配置文件
   - 检查依赖
   - 输出微信公众平台配置指引
   ↓
6. 在微信公众平台完成配置
   - 登录公众平台
   - 填写服务器URL、Token、EncodingAESKey
   - 启用服务器配置
   ↓
7. 启动插件
   openclaw plugin start wechat
   ↓
8. 测试消息收发
   ↓
9. 部署完成 ✅
```

---

### 6.3 配置更新流程

```
1. 修改配置文件
   vi config/wechat-config.json
   vi config/.env.wechat
   ↓
2. 验证配置
   node scripts/validate-config.js
   ↓
3. 重启插件
   openclaw plugin restart wechat
   ↓
4. 验证功能
   - 发送测试消息
   - 检查日志
   ↓
5. 更新完成 ✅
```

---

## 七、故障排查

### 7.1 常见问题

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 插件安装失败 | 依赖版本不匹配 | 检查openclaw/plugin-sdk版本 |
| 配置文件不存在 | 未运行安装向导 | 运行 `openclaw plugin config wechat` |
| 微信服务器验证失败 | URL无法访问 / Token错误 | 检查服务器是否启动、Token是否一致 |
| 消息加解密失败 | EncodingAESKey错误 | 确认公众平台和服务器的EncodingAESKey一致 |
| 无法调用OpenClaw API | 知识库ID错误 / API超时 | 检查配置、增加超时时间 |

---

### 7.2 日志和调试

**启用调试日志**：
```bash
# 设置日志级别
export DEBUG=openclaw:wechat:*
export LOG_LEVEL=debug

# 启动插件
openclaw plugin start wechat
```

**查看日志**：
```bash
# 查看插件日志
tail -f ~/.openclaw/logs/wechat.log

# 查看OpenClaw核心日志
tail -f ~/.openclaw/logs/core.log
```

---

## 八、附录：完整文件清单

### 插件包内容

```
openclaw-wechat-1.0.0.tgz
└── package/
    ├── openclaw.plugin.json          # 插件元数据
    ├── package.json                  # npm包描述
    ├── README.md                    # 安装和使用说明
    ├── dist/                        # 编译后的代码
    │   ├── channel.js
    │   ├── config.js
    │   ├── gateway.js
    │   └── ...
    ├── config/
    │   ├── wechat-config.template.json   # 配置模板
    │   └── .env.wechat.template        # 环境变量模板
    ├── scripts/
    │   ├── install-wizard.js            # 安装向导
    │   ├── post-install.js              # 安装后脚本
    │   ├── validate-config.js           # 配置验证
    │   └── migrate-config.js           # 配置迁移
    └── docs/
        ├── installation.md              # 安装指南
        ├── configuration.md            # 配置说明
        └── troubleshooting.md         # 故障排查
```

---

**文档结束**

_本文档由OpenClaw项目团队生成_  
_日期：2026-05-09_
