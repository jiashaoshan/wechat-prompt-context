#!/usr/bin/env node
/**
 * 步骤4：生成完整文章
 * 通过笔杆子 agent 生成文章，支持 Supermemory 记忆注入
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// 兼容 path.expandhome
function expandHome(filepath) {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

/**
 * 从 OpenClaw 配置加载模型信息
 * 换模型只需改 ~/.openclaw/openclaw.json
 */
function loadModelConfig() {
  // 端点映射：coding 端点 -> 通用聊天端点
  const ENDPOINT_MAP = {
    'coding.dashscope.aliyuncs.com': {
      hostname: 'dashscope.aliyuncs.com',
      pathPrefix: '/compatible-mode/v1',
      // coding 端点的 Key 不兼容通用端点，用 bailian-plus 的 Key
      fallbackApiKeyProvider: 'bailian-plus'
    }
  };

  function resolveEndpoint(baseUrl, providerName, providers) {
    const url = new URL(baseUrl);
    const mapping = ENDPOINT_MAP[url.hostname];
    let apiKey = null;
    if (mapping) {
      // 优先用 fallback provider 的 Key
      if (mapping.fallbackApiKeyProvider && providers[mapping.fallbackApiKeyProvider]) {
        apiKey = providers[mapping.fallbackApiKeyProvider].apiKey;
        console.log(`   ⚡ ${providerName} 端点映射到通用聊天端点，使用 ${mapping.fallbackApiKeyProvider} 的 API Key`);
      }
      return {
        hostname: mapping.hostname,
        path: mapping.pathPrefix + '/chat/completions',
        apiKey
      };
    }
    return {
      hostname: url.hostname,
      path: url.pathname.replace(/\/$/, '') + '/chat/completions'
    };
  }

  const configPath = path.join(os.homedir(), '.openclaw/openclaw.json');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const providers = config.models?.providers || {};
    
    // 1. 优先读 agents.defaults.model.primary（和 OpenClaw 会话一致的默认模型）
    const defaultModel = config.agents?.defaults?.model?.primary;
    if (defaultModel && defaultModel.includes('/')) {
      const [providerName, modelId] = defaultModel.split('/', 2);
      const provider = providers[providerName];
      if (provider) {
        const ep = resolveEndpoint(provider.baseUrl, providerName, providers);
        const cfg = {
          hostname: ep.hostname,
          path: ep.path,
          apiKey: ep.apiKey || provider.apiKey,
          model: modelId,
          provider: providerName
        };
        console.log(`🤖 使用默认模型: ${defaultModel}`);
        return cfg;
      }
    }
    
    // 2. 兼容旧版 defaultModel 字段
    const oldDefault = config.models?.defaultModel || config.defaultModel;
    if (oldDefault && oldDefault.includes('/')) {
      const [providerName, modelId] = oldDefault.split('/', 2);
      const provider = providers[providerName];
      if (provider) {
        const ep = resolveEndpoint(provider.baseUrl, providerName, providers);
        const cfg = {
          hostname: ep.hostname,
          path: ep.path,
          apiKey: ep.apiKey || provider.apiKey,
          model: modelId,
          provider: providerName
        };
        console.log(`🤖 使用模型: ${oldDefault}`);
        return cfg;
      }
    }
    
    // 3. 用任意可用提供商
    for (const [name, provider] of Object.entries(providers)) {
      if (provider.models?.length > 0) {
        const ep = resolveEndpoint(provider.baseUrl, name, providers);
        const cfg = {
          hostname: ep.hostname,
          path: ep.path,
          apiKey: ep.apiKey || provider.apiKey,
          model: provider.models[0].id,
          provider: name
        };
        console.log(`🤖 使用模型: ${name}/${cfg.model}`);
        return cfg;
      }
    }
  } catch (e) {
    console.warn(`⚠️ 无法读取配置: ${e.message}`);
  }
  
  // 最终回退
  throw new Error('无法获取模型配置，请检查 ~/.openclaw/openclaw.json');
}

// 过滤 agent 思考过程和元信息，提取纯净文章
function filterAgentOutput(rawOutput) {
  const lines = rawOutput.split('\n');
  let articleStart = -1;
  
  // 策略：找到思考过程结束的位置（"Let me write" 等标记后）
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 检测思考过程结束标记
    if (/^(Let me (write|create|start)|Okay, I'm ready|Now I'll)/i.test(line)) {
      // 这行可能包含文章开头（同一段落）
      const afterMarker = line.replace(/^(Let me (write|create|start)|Okay, I'm ready|Now I'll)[^\u4e00-\u9fff]*/i, '').trim();
      if (afterMarker && /[\u4e00-\u9fff]/.test(afterMarker)) {
        // 同行就有中文内容
        lines[i] = afterMarker;
        articleStart = i;
      } else {
        // 下一行是文章
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() && /[\u4e00-\u9fff]/.test(lines[j])) {
            articleStart = j;
            break;
          }
        }
      }
      break;
    }
  }
  
  // 如果没找到标记，用中文密度检测
  if (articleStart === -1) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (/^(Let me|I'll|The user|Requirements|Beginning|Body|Ending|Style|Word count|Format|No explanations)/.test(line)) continue;
      
      if (/[\u4e00-\u9fff]/.test(line)) {
        const remaining = lines.slice(i).join('\n');
        const chineseCount = (remaining.match(/[\u4e00-\u9fff]/g) || []).length;
        if (chineseCount > 50) {
          articleStart = i;
          break;
        }
      }
    }
  }
  
  if (articleStart > 0) {
    return lines.slice(articleStart).join('\n');
  }
  
  return rawOutput;
}

// 通过 creator 笔杆子 agent 生成文章
async function writeArticleWithAgent(prompt, topic) {
  console.log('✍️ 调用笔杆子 agent 生成文章...');
  
  const { execSync } = require('child_process');
  
  const message = `请根据以下提示词创作一篇公众号文章：

主题：${topic}

提示词要求：
${prompt}

要求：
1. 严格按照提示词的风格和结构要求
2. 字数 2000-3000 字
3. 使用 Markdown 格式
4. 直接输出文章内容，不要包含任何解释、思考过程或前言
5. 第一行必须是文章正文，不要输出 "好的"、"Let me" 等过渡语

请直接开始写作：`;

  console.log('   🚀 启动笔杆子 agent...');
  
  try {
    const rawOutput = execSync(
      `openclaw agent --agent creator --message ${JSON.stringify(message)}`,
      {
        cwd: process.env.HOME,
        timeout: 600000,
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit']
      }
    );
    
    if (!rawOutput || rawOutput.trim().length < 100) {
      throw new Error('agent 返回内容为空或过短');
    }
    
    // 过滤思考过程和元信息
    const article = filterAgentOutput(rawOutput);
    
    console.log('   ✅ 文章生成完成（已过滤元信息）');
    return article;
  } catch (e) {
    throw new Error(`agent 调用失败: ${e.message}`);
  }
}

// 备用：直接调用 LLM
async function writeArticleWithLLM(prompt, topic) {
  console.log('✍️ 使用备用 LLM 生成文章...');
  
  const { callLLM } = require('../../wechat-ai-writer/scripts/llm-client');
  
  const messages = [
    {
      role: 'system',
      content: '你是一位资深公众号写手，严格按照提示词要求创作高质量文章。'
    },
    {
      role: 'user',
      content: prompt
    }
  ];
  
  const article = await callLLM(messages, { maxTokens: 4096 });
  
  console.log('   ✅ 文章生成完成');
  return article;
}

// 添加 Frontmatter
function addFrontmatter(article, topic, coverPath) {
  const title = generateTitle(topic);
  // 修复：转义title中的双引号，避免YAML解析错误
  const escapedTitle = title.replace(/"/g, '\\"');
  const frontmatter = `---
title: "${escapedTitle}"
cover: "${coverPath}"
author: "主语说"
date: "${new Date().toISOString().split('T')[0]}"
tags: ["${topic}"]
---

`;
  
  return frontmatter + article;
}

// 生成标题
function generateTitle(topic) {
  const templates = [
    `${topic}：那些没人敢说的真相`,
    `关于${topic}，90%的人都想错了`,
    `${topic}的真相，看完我沉默了`,
    `为什么${topic}总是让你焦虑？`,
    `${topic}：一篇文章说透本质`,
    `第一批${topic}的人，真的"赚麻了"？`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

// 生成封面
async function generateCover(topic) {
  console.log('🎨 生成封面...');
  
  const { generateCover: genCover } = require('../../wechat-ai-writer/scripts/generate-cover');
  const outputDir = path.join(__dirname, '../output');
  
  const insights = [{ title: topic }];
  
  try {
    const coverPath = await genCover(topic, insights);
    console.log('   ✅ 封面生成完成');
    return coverPath;
  } catch (e) {
    console.log('   ⚠️ 封面生成失败，使用占位图');
    return path.join(outputDir, 'cover.jpg');
  }
}

// 主函数
async function main(prompt, topic) {
  const outputDir = path.join(__dirname, '../output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 生成封面
  const coverPath = await generateCover(topic);
  
  // 通过笔杆子 agent 生成文章
  const article = await writeArticleWithAgent(prompt, topic);
  
  // 添加 Frontmatter
  const articleWithFrontmatter = addFrontmatter(article, topic, coverPath);
  
  // 验证文章完整性（字数检查）
  const bodyMatch = articleWithFrontmatter.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : article;
  const wordCount = body.replace(/\s/g, '').length;
  const minWordCount = 1500;
  
  console.log(`\n📊 字数统计：${wordCount} 字符 (最低要求: ${minWordCount})`);
  
  if (wordCount < minWordCount) {
    console.error(`❌ 文章字数不足: ${wordCount} < ${minWordCount}，生成不完整`);
    throw new Error(`文章生成不完整: 字数 ${wordCount} < ${minWordCount}`);
  }
  
  // 验证编码完整性（只检测UTF-8替换字符U+FFFD）
  const replacementChar = String.fromCharCode(0xFFFD);
  const garbledCount = (body.split(replacementChar).length - 1);
  
  if (garbledCount > 5) { // 允许少量替换字符
    console.error(`❌ 检测到乱码: 发现 ${garbledCount} 处替换字符`);
    throw new Error(`文章编码异常: 检测到 ${garbledCount} 处乱码`);
  }
  console.log(`✅ 编码检查通过 (${garbledCount} 处替换字符，在容忍范围内)`);
  
  // 保存
  const articlePath = path.join(outputDir, 'article.md');
  fs.writeFileSync(articlePath, articleWithFrontmatter);
  
  console.log(`\n✅ 文章保存完成：${articlePath}`);
  
  return articlePath;
}

// CLI
if (require.main === module) {
  const promptPath = process.argv[2];
  const topic = process.argv[3];
  
  if (!promptPath || !topic) {
    console.log('Usage: node write-article.js "path/to/prompt.txt" "主题"');
    process.exit(1);
  }
  
  const prompt = fs.readFileSync(promptPath, 'utf8');
  
  main(prompt, topic).catch(console.error);
}

module.exports = { 
  writeArticle: writeArticleWithAgent, 
  writeArticleWithLLM,
  main 
};
