#!/usr/bin/env node
/**
 * 生成提示词
 * 使用笔杆子 agent 优化
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 修复 TDZ 问题：使用独立函数替代修改原生 path
function expandUser(filepath) {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

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

// 使用笔杆子 agent 优化
async function optimizeWithAgent(baseTemplate, topic) {
  console.log('   使用笔杆子 agent 优化...');
  
  // 构建提示词
  const prompt = `你是一位提示词工程专家。请优化以下提示词模板，使其更适合生成关于"${topic}"的公众号文章。

优化原则：
1. 使用 XML 标签明确结构（<instruction>, <example>, <output>）
2. 添加 Few-shot 示例
3. 明确输出格式和要求
4. 使用角色设定增强效果
5. 添加约束条件（字数、风格等）

请优化以下提示词模板：

${baseTemplate}

要求：
- 保持原有结构和核心要求
- 增加具体的示例和约束
- 使用更明确的指令格式
- 确保输出是可直接使用的完整提示词
- 主题：${topic}

直接输出优化后的完整提示词，不要解释。`;

  // 保存提示词到临时文件
  const tempDir = path.join(__dirname, '../output');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const promptPath = path.join(tempDir, 'optimize_prompt.txt');
  fs.writeFileSync(promptPath, prompt, 'utf-8');

  // 调用笔杆子 agent
  try {
    // 修复：使用 -m 参数传递提示词内容，而不是 --file
    const promptContent = fs.readFileSync(promptPath, 'utf-8');
    const escapedPrompt = promptContent.replace(/'/g, "'\\''").replace(/"/g, '\\"');
    const openclawCmd = `openclaw agent --agent creator -m "${escapedPrompt}" --json --timeout 300 2>/dev/null`;
    
    const result = execSync(openclawCmd, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300000 // 5分钟
    });

    // 解析返回结果
    let optimized = '';
    try {
      const parsed = JSON.parse(result);
      if (parsed.result && parsed.result.payloads && parsed.result.payloads.length > 0) {
        optimized = parsed.result.payloads.map(p => p.text || '').join('\n');
      } else if (parsed.text) {
        optimized = parsed.text;
      }
    } catch (e) {
      optimized = result;
    }

    console.log('   ✅ 笔杆子 agent 优化完成');
    return optimized;
    
  } catch (e) {
    console.error('   ⚠️ 笔杆子 agent 优化失败:', e.message);
    // 返回原模板
    return baseTemplate;
  }
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
  
  // 2. 使用笔杆子 agent 优化
  const optimizedTemplate = await optimizeWithAgent(baseTemplate, topic);
  
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