# 📝 微信公众号提示词写作助手 (wechat-prompt-context)

通过提示词工程 + 笔杆子 agent 生成高质量公众号文章，支持人机协作确认，确保输出质量。

核心特点：**可控的 AI 写作** — 用户参与提示词设计，笔杆子 agent 负责创作，自动过滤思考过程，输出纯净文章。

[![GitHub](https://img.shields.io/badge/GitHub-jiashaoshan-blue)](https://github.com/jiashaoshan/wechat-prompt-context)

---

## ✨ 功能特性

- **🧠 智能主题分析**：自动搜索小红书/知乎/公众号高赞内容，生成推荐主题
- **📝 双模式提示词生成**：固定模板优化 / 示例文章反推
- **🤖 笔杆子 agent 创作**：调用 OpenClaw `creator` agent，支持 Supermemory 记忆注入
- **🛡️ 思考过程过滤**：自动过滤 agent 的英文 planning 和元信息，只保留纯净文章
- **🖼️ 智能封面**：Pexels 真实图片优先，豆包 AI 生成备选
- **📊 内容校验拦截**：字数 <1500 或乱码 >5 处自动拦截
- **🎨 多主题发布**：16+ 套排版主题（pie / lapis / newsroom 等）
- **👥 人机协作**：提示词确认机制，支持多轮修改

---

## 🏗️ 技术架构

### 完整工作流

```
用户输入
├── 模糊主题词（必填）
├── 示例文章链接（可选，用于风格反推）
└── 主题样式（可选，默认 pie）
    ↓
┌─────────────────────────────────────────┐
│ 步骤1: 分析主题 (analyze-topic.js)       │
│ ├─ 搜索小红书高赞内容                     │
│ ├─ 搜索知乎高赞内容                       │
│ ├─ 搜索公众号高赞内容                     │
│ └─ LLM 分析 → 推荐主题 + 文章类型          │
├─────────────────────────────────────────┤
│ 步骤2: 生成提示词                          │
│ ├─ 方式A: 固定模板 + 专家优化              │
│ │   (无示例文章时使用)                     │
│ └─ 方式B: 示例文章反推                    │
│     (有参考链接时使用)                     │
├─────────────────────────────────────────┤
│ 步骤3: 用户确认 (可选)                     │
│ ├─ 展示提示词                             │
│ ├─ 用户选择: 确认 / 修改 / 退出            │
│ └─ 最多 5 轮确认                          │
├─────────────────────────────────────────┤
│ 步骤4: 生成文章 (write-article.js)        │
│ ├─ 封面生成: Pexels / 豆包 AI              │
│ ├─ 调用笔杆子 agent 创作                  │
│ │   └── openclaw agent --agent creator   │
│ ├─ 过滤思考过程 (filterAgentOutput)       │
│ ├─ 内容校验 (字数 + 编码)                 │
│ └─ 输出: article.md + cover.jpg          │
├─────────────────────────────────────────┤
│ 步骤5: 发布 (publish.js)                  │
│ ├─ 校验 Frontmatter 完整性               │
│ ├─ 校验字数 ≥ 1500                        │
│ ├─ 封面压缩 (如需要)                      │
│ └─ wenyan-cli publish → 微信草稿箱         │
└─────────────────────────────────────────┘
```

### 核心模块

| 模块 | 文件 | 功能 | 输出 |
|------|------|------|------|
| **主题分析** | `analyze-topic.js` | 多平台搜索 + LLM 分析 | 推荐主题 + 文章类型 |
| **提示词生成** | `generate-prompt.js` | 模板方式生成提示词 | 完整提示词 |
| **提示词提取** | `extract-prompt.js` | 示例文章反推提示词 | 风格化提示词 |
| **提示词确认** | `confirm-prompt.js` | 交互式确认/修改 | 确认后的提示词 |
| **文章生成** | `write-article.js` | 笔杆子 agent 创作 + 过滤 | article.md + cover.jpg |
| **发布** | `publish.js` | 校验 + 发布到微信 | 草稿箱文章 |
| **主入口** | `main.js` | 完整流程编排 | 全流程执行 |

### 文章生成架构

```
write-article.js
    │
    ├── generateCover()
    │   ├── 尝试 Pexels (真实图片)
    │   └── 备选 豆包 AI 生成
    │
    ├── writeArticleWithAgent()
    │   └── execSync: openclaw agent --agent creator
    │       ├── 笔杆子 agent 创作
    │       └── 返回 rawOutput (可能含 thinking)
    │
    ├── filterAgentOutput()
    │   ├── 检测 "Let me write" 等标记
    │   ├── 截取纯净中文文章
    │   └── 过滤英文 planning
    │
    ├── validateContent()
    │   ├── 字数检查 ≥ 1500
    │   └── 编码检查 (替换字符 ≤ 5)
    │
    └── addFrontmatter()
        ├── title / cover / author / date / tags
        └── 输出完整 article.md
```

### 关键设计决策

| 决策 | 方案 | 原因 |
|------|------|------|
| 文章生成 | `openclaw agent --agent creator` | 利用 agent 框架级模型管理 + Supermemory |
| 思考过程过滤 | `filterAgentOutput()` | agent 会输出英文 planning，需过滤 |
| 封面策略 | Pexels 优先 → 豆包备选 | 真实图片质量更高 |
| 内容校验 | 生成后 + 发布前双阶段 | 确保不完整文章不发布 |
| 模型选择 | agent 默认模型配置 | 通过 `openclaw.json` 统一管理 |

---

## 📦 依赖

### 必需依赖

| 依赖 | 用途 | 配置方式 |
|------|------|----------|
| **Node.js** | 运行环境 | [官网下载](https://nodejs.org/) |
| **笔杆子 agent** | 文章生成 | OpenClaw 内置 (`creator`) |
| **豆包 API** | 封面图生成 | 配置 OpenClaw 豆包模型 |
| **Tavily API** | 小红书/知乎搜索 | OpenClaw 内置 |

### 发布依赖（可选）

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| `wechat-mp-publisher` | 公众号发布 | `~/.openclaw/workspace/skills/wechat-mp-publisher` |
| `wenyan-cli` | 发布工具 | `npm install -g @wenyan-md/cli` |

### OpenClaw Agent 配置

```jsonc
{
  "agents": {
    "list": [
      {
        "id": "creator",
        "name": "笔杆子",
        "workspace": "~/.openclaw/workspace-creator"
      }
    ]
  }
}
```

### 环境变量

```bash
export WECHAT_APP_ID="your_wechat_app_id"
export WECHAT_APP_SECRET="your_wechat_app_secret"
```

---

## 🚀 快速开始

### 基础用法

```bash
# 方式1：只有主题词（模板生成提示词）
node scripts/main.js --topic="AI赚钱"

# 方式2：主题词 + 示例文章（反推提示词）
node scripts/main.js --topic="AI赚钱" --example="https://mp.weixin.qq.com/s/xxx"

# 方式3：指定主题样式
node scripts/main.js --topic="AI赚钱" --theme=newsroom

# 方式4：自动确认模式（跳过提示词确认）
node scripts/main.js --topic="AI赚钱" --theme=newsroom --auto-confirm

# 方式5：完整参数
node scripts/main.js --topic="AI赚钱" --example="https://..." --theme=purple
```

### 分步执行

```bash
# 步骤1：分析主题
node scripts/analyze-topic.js "AI赚钱"

# 步骤2A：生成提示词（模板方式）
node scripts/generate-prompt.js "AI赚钱" story

# 步骤2B：提取提示词（示例方式）
node scripts/extract-prompt.js "https://mp.weixin.qq.com/s/xxx"

# 步骤3：确认提示词（交互式）
node scripts/confirm-prompt.js "path/to/prompt.txt"

# 步骤4：生成文章
node scripts/write-article.js "path/to/prompt.txt" "AI赚钱"

# 步骤5：发布
node scripts/publish.js "path/to/article.md" newsroom
```

---

## 📖 详细文档

### 双模式提示词生成

#### 方式A：固定模板 + 专家优化

```
固定提示词模板（基础框架）
    ↓
+ 文章类型模板（story / analysis / list / opinion）
    ↓
+ 模糊主题词的具体内容填充
    ↓
= 完善的最终提示词
```

**适用场景**：没有参考文章、需要标准公众号风格、快速生成。

#### 方式B：示例文章反推

```
示例文章链接
    ↓
提取文章内容（web_fetch / browser）
    ↓
LLM 分析：
    - 文章结构和风格
    - 写作技巧和特点
    - 语言表达方式
    ↓
生成相似风格的提示词
```

**适用场景**：有喜欢的参考文章、需要模仿特定风格、精确控制输出质量。

---

### 文章类型模板

| 类型 | 适用场景 | 特点 |
|------|----------|------|
| **story** | 情感、人物、经历 | 故事化、口语化、金句 |
| **analysis** | 商业、科技、趋势 | 逻辑清晰、数据支撑 |
| **list** | 干货、攻略、方法论 | 步骤清晰、可操作 |
| **opinion** | 评论、观点、思考 | 有态度、论据扎实 |

---

### 人机协作确认机制

```
生成提示词
    ↓
展示给用户
    ↓
用户选择：
    ├── [yes/y] → 确认，进入下一步
    ├── [modify/m] → 提出修改意见 → 重新生成
    ├── [view/v] → 再次查看
    └── [quit/q] → 退出
    ↓
（最多 5 轮确认）
```

**有效反馈示例**：
- "增加 3 个具体案例"
- "语气更口语化，像朋友聊天"
- "针对 25-35 岁职场人群"
- "减少理论，增加故事"

---

### 发布主题选择

| 文章类型 | 推荐主题 |
|----------|----------|
| 商业分析 | `newsroom`, `lapis` |
| 情感故事 | `ember`, `orangeheart` |
| 科技评论 | `lapis`, `phycat` |
| 生活感悟 | `sage`, `pie` |
| 创意设计 | `aurora`, `purple` |

完整主题列表见 `config/default.yaml`。

---

### 输出结构

```
output/
├── topic_analysis.json     # 主题分析结果
├── generated_prompt.txt    # 生成的提示词
├── confirmed_prompt.txt    # 确认后的提示词
├── extracted_prompt.json   # 从示例提取的提示词
├── article.md              # 完整文章（含 Frontmatter）
└── cover.jpg               # 封面图
```

---

## 🎯 最佳实践

### 主题词设计

**好的主题词**：
- ✅ "第一批用 AI 搞钱的年轻人"
- ✅ "职场 PUA：那些没人敢说的真相"

**差的主题词**：
- ❌ "AI"（太宽泛）
- ❌ "职场"（太笼统）

### 示例文章选择

**好的示例**：10 万 + 爆款、风格明确、与目标类型一致。
**差的示例**：风格模糊、需登录才能查看。

---

## 🔧 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 搜索失败 | Tavily API 问题 | 检查网络，稍后重试 |
| 提示词不满意 | 模板不匹配 | 使用方式 B（示例反推） |
| 文章含英文思考 | agent 输出未过滤 | 确认 `filterAgentOutput()` 已启用 |
| 封面生成失败 | Pexels/豆包 API 问题 | 使用默认占位图 |
| 发布失败 | 环境变量未设置 | 设置 `WECHAT_APP_ID` / `SECRET` |
| IP 不在白名单 | 公众号限制 | 添加服务器 IP 到白名单 |

---

## 📚 与 wechat-ai-writer 的区别

| 维度 | wechat-ai-writer | wechat-prompt-context |
|------|------------------|----------------------|
| **核心定位** | 全自动快速生成 | 人机协作可控生成 |
| **用户参与** | 全自动，无干预 | **参与提示词设计** |
| **风格控制** | 固定模板 | **模板/示例双模式** |
| **质量保证** | 依赖模板质量 | **用户确认提示词** |
| **适用场景** | 批量快速生成 | **精品文章创作** |

---

## 📝 更新日志

### v1.4 (2026-04-07)

- ✅ 改用 `笔杆子 agent` 生成文章（`openclaw agent --agent creator`）
- ✅ 新增 `filterAgentOutput()` 过滤 agent 思考过程和元信息
- ✅ 提示词增加禁止输出过渡语的约束
- ✅ 文章开头完整保留，不再截断
- ✅ 移除直接 API 调用逻辑，统一走 agent 框架
- ✅ 内容校验双阶段拦截（生成 + 发布前）

### v1.3 (2026-04-07)

- ✅ 动态读取 OpenClaw 默认模型配置
- ✅ 从 `agents.defaults.model.primary` 自动获取模型
- ✅ 直连 API 替代 agent 子进程（已废弃，改用 agent）
- ✅ 内容完整性校验：字数 <1500 或乱码 >5 处自动拦截

### v1.2 (2026-04-05)

- ✅ 新增 7 种文章类型模板（共 11 种）
- ✅ 更新 analyze-topic.js 文章类型智能识别

### v1.1 (2026-03-30)

- ✅ 重构文章生成：通过笔杆子 agent 路由
- ✅ 支持 Supermemory 记忆自动注入
- ✅ 失败自动回退到直接 LLM 调用

### v1.0 - 初始版本

- ✅ 支持模糊主题分析
- ✅ 支持模板生成和示例反推两种提示词生成方式
- ✅ 支持人机协作确认
- ✅ 支持多主题样式发布
- ✅ 4 种文章类型模板

---

## 📄 License

MIT License © 2026 Yang Yanqing
