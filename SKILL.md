---
name: wechat-prompt-context
description: "通过提示词工程生成微信公众号文章并上传。支持模糊主题词、示例文章链接反推提示词、人机协作确认、多主题样式发布。"
metadata:
  openclaw:
    emoji: "📝"
    requires:
      skills: ["wechat-article-search", "wechat-toolkit", "prompt-engineering-expert", "wechat-ai-writer"]
      env: ["WECHAT_APP_ID", "WECHAT_APP_SECRET"]
---

# 📝 微信公众号提示词写作助手 (wechat-prompt-context)

通过提示词工程生成高质量公众号文章，支持人机协作确认，确保输出质量。核心特点是**可控的AI写作**——用户参与提示词设计过程，而非完全自动化。

---

## 设计理念

### 为什么做这个技能？

现有AI写作工具的问题：
- **全自动生成**：用户无法控制文章风格和结构
- **风格单一**：所有文章都像一个模子刻出来的
- **质量不稳定**：有时好有时差，难以预期

**wechat-prompt-context** 的解决思路：
- **人机协作**：AI生成提示词，用户确认后再生成文章
- **风格可控**：通过示例文章反推，精确模仿特定风格
- **质量保障**：用户参与提示词设计，确保输出符合预期

### 核心设计原则

1. **提示词即产品** - 好的提示词决定好的文章
2. **用户参与** - 不是全自动，而是人机协作
3. **风格可控** - 支持通过示例文章精确控制风格
4. **迭代优化** - 不满意可以修改提示词重新生成

---

## 技术架构

```
用户输入
├── 模糊主题词（必填）
├── 示例文章链接（可选）
└── 主题样式（可选，默认pie）
    ↓
[步骤1: 分析主题]
    ├── 搜索小红书高赞
    ├── 搜索知乎高赞
    ├── 搜索公众号高赞
    └── LLM智能分析生成推荐主题
    ↓
[步骤2: 生成提示词] ←─┐
    ├── 有示例链接？ ──┤
    │   ├── 是 → 反推提示词（方式B）
    │   └── 否 → 模板+专家优化（方式A）
    ↓
[步骤3: 用户确认] ←───┘（不满意返回步骤2）
    ├── 展示提示词
    ├── 用户选择：确认/修改/退出
    └── 修改意见 → 重新生成
    ↓
[步骤4: 生成文章]
    ├── 调用LLM生成完整文章
    ├── 生成封面图（豆包AI）
    └── 添加Frontmatter
    ↓
[步骤5: 发布]
    └── 使用指定主题发布到公众号草稿箱
```

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **输入层** | CLI参数 | 主题词、示例链接、主题样式 |
| **搜索层** | Tavily API | 小红书/知乎高赞搜索 |
| | wechat-article-search | 公众号高赞搜索 |
| **生成层** | 直连 LLM API | 动态读取 OpenClaw 默认模型，无需 agent 子进程 |
| | 豆包Seedream 5.0 | 封面图生成 |
| **确认层** | Node.js readline | 交互式用户确认 |
| **发布层** | wechat-mp-publisher | 公众号发布（优先） |
| | wechat-toolkit | 公众号发布（备选） |

---

## 核心能力

### 5步完整工作流

| 步骤 | 模块 | 功能 | 输出 |
|------|------|------|------|
| 1 | **analyze-topic.js** | 智能分析模糊主题词 | 推荐主题+文章类型+目标读者+核心卖点 |
| 2 | **generate-prompt.js** / **extract-prompt.js** | 生成提示词（双模式） | 完整提示词 |
| 3 | **confirm-prompt.js** | 用户确认提示词 | 确认后的提示词 |
| 4 | **write-article.js** | 通过笔杆子 agent 生成文章 | article.md + cover.jpg |
| 5 | **publish.js** | 发布到公众号 | 草稿箱文章 |

### 文章生成方式（v1.2 更新）

**动态模型配置（推荐）**：
```
write-article.js
    ↓
读取 openclaw.json → agents.defaults.model.primary
    ↓
直连 LLM API（无需 agent 子进程）
    ↓
生成文章
```

**优势**：
- ✅ 自动跟随 OpenClaw 默认模型，改配置即生效
- ✅ 直连 API，无子进程 OOM 风险
- ✅ 支持所有配置的提供商
- ✅ 无需硬编码 API Key
- ✅ 内容校验：字数 <1500 或乱码 >5 处自动拦截

### 双模式提示词生成

#### 方式A：固定模板 + prompt-engineering-expert 优化

```
固定提示词模板（基础框架）
    ↓
+ prompt-engineering-expert 技能优化
    - 添加XML标签明确结构
    - 增加Few-shot示例
    - 明确约束条件
    ↓
+ 模糊主题词的具体内容填充
    ↓
= 完善的最终提示词
```

**适用场景**：
- 没有参考文章
- 需要标准公众号风格
- 快速生成

#### 方式B：示例文章反推

```
示例文章链接
    ↓
提取文章内容（web_fetch/browser）
    ↓
LLM分析：
    - 文章结构和风格
    - 写作技巧和特点
    - 语言表达方式
    ↓
生成相似风格的提示词
```

**适用场景**：
- 有喜欢的参考文章
- 需要模仿特定风格
- 精确控制输出质量

### 11种文章类型模板

| 类型 | 文件 | 适用场景 | 特点 |
|------|------|----------|------|
| **story** | story.md | 情感、人物、经历 | 故事化、口语化、金句 |
| **analysis** | analysis.md | 商业、科技、趋势 | 逻辑清晰、数据支撑 |
| **list** | list.md | 干货、攻略、方法论 | 步骤清晰、可操作 |
| **opinion** | opinion.md | 评论、观点、思考 | 有态度、论据扎实 |
| **tech-report** | tech-report.md | 科技产品、创业故事 | 产品拆解+商业模式+创业史 |
| **marketing-trend** | marketing-trend.md | 消费洞察、品牌案例 | 趋势解读+品牌解法+文化基因 |
| **investigation** | investigation.md | 事故调查、政策后遗症 | 现场还原+人物肖像+系统性困境 |
| **cinema-culture** | cinema-culture.md | 票房现象、类型片研究 | 类型拆解+文化基因+批判分析 |
| **lifestyle-healing** | lifestyle-healing.md | 独处美学、心理疗愈 | 价值重估+名人例证+实操方法 |
| **edu-course** | edu-course.md | 知识付费、课程推广 | 痛点切入+概念包装+产品落地 |
| **industry-evolution** | industry-evolution.md | 岗位演进、技术变革 | 历史纵深+概念创新+哲学提炼 |

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
（最多5轮确认）
```

**用户反馈示例**：
- "增加更多案例"
- "语气更口语化一些"
- "减少理论，增加故事"
- "针对职场人群"

---

## 使用方法

### 基础用法

```bash
# 方式1：只有主题词（模板生成提示词）
node ~/.openclaw/workspace/skills/wechat-prompt-context/scripts/main.js --topic="AI赚钱"

# 方式2：主题词 + 示例文章（反推提示词）
node ~/.openclaw/workspace/skills/wechat-prompt-context/scripts/main.js \
  --topic="AI赚钱" \
  --example="https://mp.weixin.qq.com/s/xxx"

# 方式3：指定主题样式
node ~/.openclaw/workspace/skills/wechat-prompt-context/scripts/main.js \
  --topic="AI赚钱" \
  --theme=newsroom

# 方式4：完整参数
node ~/.openclaw/workspace/skills/wechat-prompt-context/scripts/main.js \
  --topic="AI赚钱" \
  --example="https://..." \
  --theme=purple
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

## 配置说明

编辑 `config/default.yaml`：

```yaml
# 默认设置
defaults:
  theme: "pie"           # 默认发布主题
  articleType: "story"   # 默认文章类型
  highlight: "github"    # 默认代码高亮

# 文章类型映射
articleTypes:
  story:
    name: "故事型"
    description: "适合情感、人物、经历类文章"
    template: "story.md"
  analysis:
    name: "分析型"
    description: "适合商业、科技、趋势分析"
    template: "analysis.md"
  list:
    name: "清单型"
    description: "适合干货、攻略、方法论"
    template: "list.md"
  opinion:
    name: "观点型"
    description: "适合评论、观点、思考"
    template: "opinion.md"

# 发布主题列表
themes:
  builtin:
    - pie          # 简洁优雅，默认推荐
    - lapis        # 深蓝配色，专业感
    - orangeheart  # 暖橙色调，活力感
    - rainbow      # 彩虹渐变，活泼感
    - maize        # 玉米黄，温暖感
    - purple       # 紫色调，神秘感
    - phycat       # 物理猫，科技感
    - default      # 简约默认
  custom:
    - aurora       # 极光渐变，视觉冲击
    - newsroom     # 报纸风格，严肃感
    - sage         # 清新自然，绿色调
    - ember        # 暖色调，温馨感

# 代码高亮主题
highlights:
  - github
  - github-dark
  - atom-one-dark
  - atom-one-light
  - dracula
  - monokai
  - solarized-dark
  - solarized-light
  - xcode

# LLM配置
llm:
  model: "kimi-k2.5"
  maxTokens: 4096
  temperature: 1  # Moonshot只支持temperature=1

# 搜索配置
search:
  xiaohongshu:
    enabled: true
    maxResults: 5
  zhihu:
    enabled: true
    maxResults: 5
  wechat:
    enabled: true
    maxResults: 5
```

---

## 提示词模板详解

### story.md - 故事型模板

**结构**：
- `<role>` - 角色设定（资深写手）
- `<task>` - 任务描述
- `<context>` - 用户上下文
- `<structure>` - 文章结构（开头/正文/结尾）
- `<style>` - 风格要求（口语化、去AI痕迹）
- `<constraints>` - 约束条件（字数、格式）
- `<example>` - Few-shot示例
- `<output>` - 输出要求

**核心特点**：
- 场景化开头
- 2-3个真实案例
- 每个案例配金句
- 温暖升华结尾

### analysis.md - 分析型模板

**核心特点**：
- 现象引入
- 现状分析
- 本质深挖
- 趋势判断
- 数据支撑

### list.md - 清单型模板

**核心特点**：
- 痛点引入
- 3-5个方法
- 每个方法含步骤+场景+案例
- 可操作性

### opinion.md - 观点型模板

**核心特点**：
- 争议观点开头
- 正面论证
- 反面论证
- 深度分析
- 金句结尾

---

## 与 wechat-ai-writer 的区别

| 维度 | wechat-ai-writer | wechat-prompt-context |
|------|------------------|----------------------|
| **核心定位** | 全自动快速生成 | 人机协作可控生成 |
| **用户参与** | 全自动，无干预 | **参与提示词设计** |
| **风格控制** | 固定模板 | **模板/示例双模式** |
| **质量保证** | 依赖模板质量 | **用户确认提示词** |
| **生成时间** | 较快（全自动） | 稍慢（需用户确认） |
| **适用场景** | 批量快速生成 | **精品文章创作** |
| **学习成本** | 低 | 中（需理解提示词） |
| **输出稳定性** | 中等 | **高（用户确认后）** |

**使用建议**：
- 需要快速批量生成 → wechat-ai-writer
- 需要精品可控输出 → wechat-prompt-context

---

## 输出结构

```
output/
├── topic_analysis.json     # 主题分析结果
├── generated_prompt.txt    # 生成的提示词
├── confirmed_prompt.txt    # 确认后的提示词
├── extracted_prompt.json   # 从示例提取的提示词（如使用方式B）
├── article.md              # 完整文章（含Frontmatter）
└── cover.jpg               # 豆包生成的封面图
```

---

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 搜索失败 | Tavily API问题 | 检查网络，稍后重试 |
| 提示词不满意 | 模板不匹配 | 使用方式B（示例反推） |
| 用户确认循环过多 | 需求不明确 | 给出具体修改意见 |
| 封面生成失败 | 豆包API问题 | 使用默认占位图 |
| 发布失败 | 环境变量未设置 | 设置WECHAT_APP_ID/SECRET |
| IP不在白名单 | 公众号限制 | 添加IP到白名单 |

---

## 最佳实践

### 1. 主题词设计

**好的主题词**：
- ✅ "第一批用AI搞钱的年轻人"
- ✅ "职场PUA：那些没人敢说的真相"
- ✅ "为什么管理中的禅修总是让你焦虑"

**差的主题词**：
- ❌ "AI"（太宽泛）
- ❌ "职场"（太笼统）
- ❌ "赚钱方法"（太普通）

### 2. 示例文章选择

**好的示例**：
- ✅ 10万+阅读的爆款文章
- ✅ 风格明确、特点鲜明
- ✅ 与目标文章类型一致

**差的示例**：
- ❌ 风格模糊的文章
- ❌ 纯图片/视频内容
- ❌ 需要登录才能查看

### 3. 提示词修改技巧

**有效反馈**：
- "增加3个具体案例"
- "语气更口语化，像朋友聊天"
- "针对25-35岁职场人群"
- "减少理论，增加故事"

**无效反馈**：
- "写得更好一点"（太模糊）
- "改一下"（不具体）

### 4. 主题样式选择

| 文章类型 | 推荐主题 |
|----------|----------|
| 商业分析 | newsroom, lapis |
| 情感故事 | ember, orangeheart |
| 科技评论 | lapis, phycat |
| 生活感悟 | sage, pie |
| 创意设计 | aurora, purple |

---

## 更新日志

- **v1.3** - 2026-04-07
  - 动态读取 OpenClaw 默认模型配置
  - 从 `agents.defaults.model.primary` 自动获取模型、URL、API Key
  - 无需改代码，改 `openclaw.json` 即可切换模型
  - 直连 API 替代 agent 子进程，避免 OOM SIGKILL
  - 内容完整性校验：字数 <1500 或乱码 >5 处自动拦截
  - 支持环境变量 `ARTICLE_MODEL_PROVIDER` 临时覆盖

- **v1.2** - 2026-04-05
  - 新增7种文章类型模板，共11种
  - 科技深度报道、消费趋势、深度调查、影视评论、生活方式、教育推广、行业演进
  - 更新 analyze-topic.js 文章类型识别逻辑

- **v1.1** - 2026-03-30
  - 重构文章生成：通过笔杆子 agent 路由
  - 支持 Supermemory 记忆自动注入
  - 失败自动回退到直接 LLM 调用
  - 字数要求调整：2000-3000 字

- **v1.0** - 初始版本
  - 支持模糊主题分析
  - 支持模板生成和示例反推两种提示词生成方式
  - 支持人机协作确认
  - 支持多主题样式发布
  - 4种文章类型模板（story/analysis/list/opinion）

---

## 开发计划

- [ ] 支持更多文章类型模板
- [ ] 支持批量生成多篇文章
- [ ] 支持历史提示词复用
- [ ] 支持自定义模板上传
- [ ] 支持文章效果追踪（阅读量分析）

---

**作者**：主语说  
**版本**：v1.3  
**更新日期**：2026-04-07
