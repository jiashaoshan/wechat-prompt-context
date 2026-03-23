#!/usr/bin/env node
/**
 * 生成提示词
 * 方式A：固定模板 + prompt-engineering-expert 优化
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 兼容 path.expanduser
path.expanduser = function(filepath) {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
};

// 加载配置
function loadConfig() {
  const configPath = path.join(__dirname, '../config/default.yaml');
  if (fs.existsSync(configPath)) {
    const yaml = require('js-yaml');
    return yaml.load(fs.readFileSync(configPath, 'utf8'));
  }
  return {};
}

// 加载模板
function loadTemplate(articleType) {
  const templatePath = path.join(__dirname, '../prompts/templates', `${articleType}.md`);
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf8');
  }
  // 默认使用story模板
  const defaultPath = path.join(__dirname, '../prompts/templates/story.md');
  return fs.readFileSync(defaultPath, 'utf8');
}

// 使用 prompt-engineering-expert 优化
async function optimizeWithPromptExpert(baseTemplate, topic) {
  console.log('   使用 prompt-engineering-expert 优化...');
  
  const promptExpertPath = path.join(
    os.homedir(),
    '.openclaw/workspace/skills/prompt-engineering-expert'
  );
  
  // 读取 SKILL.md
  let skillMd = '';
  try {
    skillMd = fs.readFileSync(path.join(promptExpertPath, 'SKILL.md'), 'utf8');
  } catch (e) {
    console.log('   ⚠️ 未找到 prompt-engineering-expert，使用默认优化');
  }
  
  const { callLLM } = require('../../wechat-ai-writer/scripts/llm-client');
  
  const messages = [
    {
      role: 'system',
      content: `你是一位提示词工程专家。请优化以下提示词模板，使其更适合生成关于"${topic}"的公众号文章。

优化原则：
1. 使用 XML 标签明确结构（<instruction>, <example>, <output>）
2. 添加 Few-shot 示例
3. 明确输出格式和要求
4. 使用角色设定增强效果
5. 添加约束条件（字数、风格等）

${skillMd ? '参考以下最佳实践：\n' + skillMd.substring(0, 1500) : ''}`
    },
    {
      role: 'user',
      content: `请优化以下提示词模板：

${baseTemplate}

要求：
- 保持原有结构和核心要求
- 增加具体的示例和约束
- 使用更明确的指令格式
- 确保输出是可直接使用的完整提示词
- 主题：${topic}`
    }
  ];
  
  const optimized = await callLLM(messages, { maxTokens: 2048 });
  return optimized;
}

// 填充变量
function fillTemplate(template, topic, userContext = '') {
  return template
    .replace(/\{\{TOPIC\}\}/g, topic)
    .replace(/\{\{USER_CONTEXT\}\}/g, userContext);
}

// 主函数
async function generatePrompt(topic, articleType, userContext = '') {
  console.log('📝 生成提示词...');
  
  // 1. 加载模板
  console.log(`   加载 ${articleType} 模板...`);
  const baseTemplate = loadTemplate(articleType);
  
  // 2. 使用 prompt-engineering-expert 优化
  const optimizedTemplate = await optimizeWithPromptExpert(baseTemplate, topic);
  
  // 3. 填充主题
  const finalPrompt = fillTemplate(optimizedTemplate, topic, userContext);
  
  // 4. 保存
  const outputDir = path.join(__dirname, '../output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(outputDir, 'generated_prompt.txt'),
    finalPrompt
  );
  
  console.log('   ✅ 提示词生成完成');
  
  return finalPrompt;
}

// CLI
if (require.main === module) {
  const topic = process.argv[2];
  const articleType = process.argv[3] || 'story';
  const userContext = process.argv[4] || '';
  
  if (!topic) {
    console.log('Usage: node generate-prompt.js "主题" [articleType] [userContext]');
    process.exit(1);
  }
  
  generatePrompt(topic, articleType, userContext).catch(console.error);
}

module.exports = { generatePrompt };
