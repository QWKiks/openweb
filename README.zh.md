# OpenWeb

**[English](README.md)** · **[Русский](README.ru.md)** · **[简体中文](README.zh.md)**

开源浏览器自动化工具，面向 AI 代理。从 Claude Code、Cursor、Windsurf、OpenCode 或任何兼容 MCP 的工具控制 Chrome。

## 架构

```
AI 代理 (Claude/Cursor/Windsurf)
    ↓ MCP (stdio)
MCP 服务器 (mcp-server.js)
    ↓ WebSocket
守护进程 (daemon.js)
    ↓ WebSocket
Chrome 扩展
    ↓ CDP
浏览器
```

## 快速开始

### 一键安装

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/QWKiks/openweb/main/install.ps1 | iex
```

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/QWKiks/openweb/main/install.sh | bash
```

此脚本将：
1. 克隆仓库并安装依赖
2. 在所有检测到的 AI 工具中注册 MCP 服务器
3. 打印加载 Chrome 扩展的说明

### 手动安装

```bash
git clone https://github.com/QWKiks/openweb.git
cd openweb
npm install
```

### 第 1 步：加载 Chrome 扩展

1. 打开 `chrome://extensions`
2. 启用 **开发者模式**（右上角）
3. 点击 **加载已解压的扩展程序** → 选择 `openweb` 文件夹
4. 扩展图标将出现在工具栏中

### 第 2 步：连接扩展

1. 点击工具栏中的 OpenWeb 图标
2. 点击 **连接** — 状态变为绿色并带有动画边框

### 第 3 步：在 AI 工具中注册 MCP

```bash
# 交互模式 — 查看已安装的工具
npm run setup-mcp

# 一次注册所有检测到的工具
npm run setup-mcp -- --all

# 或选择特定工具
npm run setup-mcp -- --claude
npm run setup-mcp -- --cursor
npm run setup-mcp -- --windsurf
npm run setup-mcp -- --gemini
npm run setup-mcp -- --antigravity
npm run setup-mcp -- --opencode
npm run setup-mcp -- --codex

# 从所有工具中移除
npm run setup-mcp -- --remove
```

注册后请重启 AI 工具。

## 工具列表

| 工具 | 说明 |
|------|------|
| `navigate` | 打开 URL（新标签页或当前标签页） |
| `snapshot` | 捕获无障碍树，返回元素引用（`@e1`、`@e2`...） |
| `screenshot` | 截取 PNG 截图 |
| `click` | 点击元素（CSS 选择器、`@e` 引用、语义化选择器）。支持合成（默认）或物理 CDP 点击 |
| `fill` | 通过 CSS 选择器或 `@e` 引用填写表单字段 |
| `hover` | 悬停在元素上（触发 mouseover/mouseenter） |
| `select` | 在 `<select>` 下拉框中选择选项 |
| `scroll` | 滚动页面或元素（下/上/顶部/底部） |
| `get_text` | 提取纯文本、原始 HTML 或结构化页面源码与元数据 |
| `key_type` | 在焦点元素中输入文本 |
| `send_keys` | 发送组合键（Enter、Ctrl+A, Tab 等） |
| `drag_drop` | 拖拽元素到另一个元素上 |
| `wait` | 等待选择器、导航完成或网络空闲 |
| `evaluate` | 在页面上执行 JavaScript |
| `list_tabs` | 列出所有打开的浏览器标签页 |
| `find_tab` | 通过 URL 模式查找标签页 |
| `close_tab` | 通过 ID 关闭标签页 |
| `network` | 捕获/列出/检查 HTTP 请求 |
| `intercept` | 阻止、重定向、修改或模拟 HTTP 请求 |
| `cookie` | 获取、设置或删除 Cookie |
| `history` | 后退、前进或刷新页面 |
| `viewport` | 更改视口大小和设备缩放因子 |
| `console` | 捕获和读取浏览器控制台输出 |
| `dialog` | 处理 JS 对话框（alert、confirm、prompt） |
| `emulate` | 模拟移动设备、地理位置、用户代理 |
| `session` | 保存和恢复浏览器会话状态 |
| `speech_to_text` | 使用本地 Whisper 转录视频/音频（离线，无需 API 密钥）。可选自动翻译 |
| `translate` | 使用 argos-translate 离线翻译文本（无需 API 密钥） |

## 语音转文字 (Local Whisper)

从任何网站转录视频和音频 **离线** — 无需 API 密钥。

**支持的平台：** YouTube、X/Twitter、TikTok、Instagram、Vimeo 以及通过 `yt-dlp` 支持的 100+ 网站。

### 安装

```bash
# 1. Python 依赖
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install faster-whisper flask

# 2. 系统依赖 (macOS)
brew install ffmpeg yt-dlp

# Linux
# sudo apt install ffmpeg yt-dlp
```

### 启动 Whisper 服务器

```bash
# 终端 1: 启动守护进程
npm start

# 终端 2: 启动本地 Whisper 服务器
python whisper-server.py

# 或使用特定模型
WHISPER_MODEL=small python whisper-server.py
```

服务器默认运行在 `http://127.0.0.1:5001`。

### 使用方法

```bash
# 打开视频页面
navigate url: "https://x.com/username/status/1234567890"

# 转录视频
speech_to_text tabId: <tab_id> language: "zh"
```

**参数：**
- `tabId` — 包含视频的标签页（可选，自动检测活动标签页）
- `videoUrl` — 直接视频链接（可选，从页面自动检测）
- `language` — 转录语言代码（例如 `"en"`、`"ru"`、`"zh"`）

**可用模型：** `tiny`、`base`（默认）、`small`、`medium`、`large` — 越大越准确但越慢。

**M1 Mac 性能：**
- `base` 模型：25分钟音频约 70 秒
- `small` 模型：25分钟音频约 2 分钟（推荐）

### 自动翻译

添加 `translateTo` 参数自动翻译转录文本：

```bash
speech_to_text tabId: <tab_id> language: "en" translateTo: "zh"
```

或使用独立的 `translate` 工具翻译任何文本：

```bash
translate text: "Hello world" from: "en" to: "zh"
```

**支持的语言对：** argos-translate 支持的任何语言对（常见：en↔zh, en↔ru, en↔es, en↔fr, en↔de 等）

## 守护进程 REPL

守护进程内置 REPL，用于快速测试：

```
openweb> navigate https://example.com
openweb> snapshot
openweb> click a
openweb> screenshot
openweb> evaluate document.title
openweb> help
openweb> quit
```

## MCP 服务器

MCP 服务器通过 WebSocket 连接到守护进程，并通过 Model Context Protocol 暴露所有工具。

**传输模式：**

```bash
# stdio（默认）— 用于 Claude Desktop、Cursor、Windsurf
node mcp-server.js

# SSE — 用于基于 HTTP 的客户端
node mcp-server.js --transport sse --port 3001
```

**自定义守护进程 URL：**

```bash
WEBBRIDGE_WS_URL=ws://192.168.1.100:10086/ws node mcp-server.js
```

## 安全性

- **身份验证：** 设置 `WEBBRIDGE_TOKEN` 以保护控制器连接（Bearer 令牌）
- 启用令牌时，守护进程拒绝不安全的 `ws://` 连接 — 请使用 `wss://`
- SSE 传输也需要 `Authorization` 请求头中的 Bearer 令牌
- 令牌比较使用 `crypto.timingSafeEqual` 防止时序攻击

## 项目结构

```
openweb/
├── manifest.json          # Chrome 扩展清单
├── background.js          # Service Worker 入口
├── daemon.js              # WebSocket 守护进程 + REPL
├── mcp-server.js          # MCP 服务器 (stdio/SSE)
├── whisper-server.py      # 本地 Whisper 语音转文字服务器
├── setup-mcp.js           # MCP 注册脚本
├── package.json
├── _locales/              # 国际化 (en, ru, zh_CN)
├── icon/                  # 扩展图标
├── popup/                 # 扩展弹窗 UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── lib/                   # 共享库
│   ├── cdp.js             # Chrome DevTools 协议管理器
│   ├── ws-client.js       # WebSocket 客户端（扩展端）
│   ├── tab-manager.js     # 标签页跟踪和分组
│   ├── snapshot-refs.js   # 无障碍树引用系统
│   ├── i18n.js            # 运行时国际化模块
│   └── match-pattern.js   # URL 匹配模式解析器
└── tools/                 # 浏览器自动化工具
    ├── registry.js        # 工具注册和分发器
    ├── navigate.js
    ├── click.js
    ├── fill.js
    ├── hover.js
    ├── select.js
    ├── scroll.js
    ├── get-text.js
    ├── snapshot.js
    ├── screenshot.js
    ├── evaluate.js
    ├── key-type.js
    ├── send-keys.js
    ├── drag-drop.js
    ├── wait.js
    ├── list-tabs.js
    ├── find-tab.js
    ├── close-tab.js
    ├── network.js
    ├── intercept.js
    ├── cookie.js
    ├── history.js
    ├── viewport.js
    ├── console.js
    ├── dialog.js
    ├── emulate.js
    ├── session.js
    ├── save-as-pdf.js
    ├── upload.js
    └── close-session.js
```

## 许可证

MIT
