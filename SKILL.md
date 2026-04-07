---
name: wechat-prompt-context
description: "通过提示词工程 + 笔杆子 agent 生成高质量公众号文章，支持人机协作确认"
version: "1.4.0"
metadata:
  openclaw:
    emoji: "📝"
    requires:
      skills: ["wechat-mp-publisher"]
    cron: ""
---

# 📝 微信公众号提示词写作助手

通过提示词工程 + 笔杆子 agent 生成高质量公众号文章，支持人机协作确认。

核心特点：**可控的 AI 写作** — 用户参与提示词设计，笔杆子 agent 负责创作，自动过滤思考过程，输出纯净文章。

## 工作流

```
用户输入主题词 (+ 可选示例文章链接)
    ↓
步骤1: 分析主题 (analyze-topic.js)
    ├── 搜索小红书/知乎/公众号高赞内容
    └── LLM 分析 → 推荐主题 + 文章类型
    ↓
步骤2: 生成提示词
    ├── 方式A: 固定模板 + 专家优化（无示例时）
    └── 方式B: 示例文章反推（有参考链接时）
    ↓
步骤3: 用户确认提示词（可选，最多 5 轮）
    ↓
步骤4: 生成文章 (write-article.js)
    ├── Pexels / 豆包生成封面
    ├── 笔杆子 agent 创作 (openclaw agent --agent creator)
    ├── 过滤 agent 思考过程 (filterAgentOutput)
    └── 内容校验 (字数 ≥1500, 乱码 ≤5)
    ↓
步骤5: 发布 (publish.js)
    ├── 校验 Frontmatter + 字数 + 编码
    ├── 封面压缩
    └── wenyan-cli publish → 微信草稿箱
```

## 使用方法

```bash
# 基础用法
node scripts/main.js --topic="AI赚钱"

# 示例反推
node scripts/main.js --topic="AI赚钱" --example="https://mp.weixin.qq.com/s/xxx"

# 指定主题样式
node scripts/main.js --topic="AI赚钱" --theme=newsroom

# 自动确认（跳过提示词确认）
node scripts/main.js --topic="AI赚钱" --auto-confirm
```

## 架构

### 核心模块

| 模块 | 文件 | 功能 |
|------|------|------|
| 主题分析 | `analyze-topic.js` | 多平台搜索 + LLM 分析 |
| 提示词生成 | `generate-prompt.js` | 模板方式生成 |
| 提示词提取 | `extract-prompt.js` | 示例文章反推 |
| 提示词确认 | `confirm-prompt.js` | 交互式确认/修改 |
| 文章生成 | `write-article.js` | 笔杆子 agent 创作 + 过滤 |
| 发布 | `publish.js` | 校验 + 发布到微信 |

### 关键设计

| 决策 | 方案 | 原因 |
|------|------|------|
| 文章生成 | `openclaw agent --agent creator` | 利用 agent 框架级模型管理 + Supermemory |
| 思考过滤 | `filterAgentOutput()` | 过滤 agent 英文 planning 和元信息 |
| 封面策略 | Pexels 优先 → 豆包备选 | 真实图片质量更高 |
| 内容校验 | 双阶段拦截 | 不完整文章不发布 |
| 模型选择 | agent 默认模型配置 | 通过 `openclaw.json` 统一管理 |

## 文章类型

| 类型 | 适用场景 |
|------|----------|
| **story** | 情感、人物、经历 |
| **analysis** | 商业、科技、趋势 |
| **list** | 干货、攻略、方法论 |
| **opinion** | 评论、观点、思考 |

## 发布主题

16+ 套排版主题：`pie` / `lapis` / `newsroom` / `ember` / `sage` / `aurora` 等。

## 输出

```
output/
├── topic_analysis.json     # 主题分析
├── generated_prompt.txt    # 生成的提示词
├── article.md              # 完整文章（含 Frontmatter）
└── cover.jpg               # 封面图
```

## 依赖

- Node.js
- OpenClaw `creator` 笔杆子 agent
- 豆包 API（封面图）
- Tavily API（搜索）
- wenyan-cli（发布）

## 版本

### v1.4.0 (2026-04-07)

- ✅ 改用 `笔杆子 agent` 生成文章
- ✅ 新增 `filterAgentOutput()` 过滤 agent 思考过程
- ✅ 提示词增加禁止输出过渡语的约束
- ✅ 移除直接 API 调用逻辑，统一走 agent 框架
- ✅ 内容校验双阶段拦截

### v1.3.0 (2026-04-07)

- ✅ 动态读取 OpenClaw 默认模型配置
- ✅ 直连 API 替代 agent 子进程（已废弃）
- ✅ 内容完整性校验

### v1.2.0 (2026-04-05)

- ✅ 新增 7 种文章类型模板

### v1.0.0 (2026-03-30)

- 🎉 初始版本发布
