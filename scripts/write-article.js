#!/usr/bin/env node
/**
 * 步骤4：生成完整文章
 * 通过笔杆子 agent 生成文章，支持 Supermemory 记忆注入
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 兼容 path.expandhome
function expandHome(filepath) {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

// 通过笔杆子 agent 生成文章
async function writeArticleWithAgent(prompt, topic) {
  console.log('✍️ 通过笔杆子 agent 生成文章...');
  
  const message = `请根据以下提示词创作一篇公众号文章：

主题：${topic}

提示词要求：
${prompt}

要求：
1. 严格按照提示词的风格和结构要求
2. 字数 2000-3000 字
3. 使用 Markdown 格式
4. 直接输出文章内容，不要包含任何解释或前言

请直接开始写作：`;

  try {
    // 调用 openclaw agent 命令
    const result = execSync(
      `openclaw agent --agent creator --message '${message.replace(/'/g, "'\\''")}' --json --timeout 600`,
      {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 600000 // 10分钟
      }
    );
    
    const response = JSON.parse(result);
    
    if (response.status !== 'ok') {
      throw new Error(`Agent 错误: ${response.status}`);
    }
    
    // 提取文章内容 - 从 payloads 中提取文本
    let article = '';
    if (response.result && response.result.payloads && response.result.payloads.length > 0) {
      article = response.result.payloads.map(p => p.text || '').join('\n');
    }
    
    if (!article) {
      throw new Error('Agent 返回内容为空');
    }
    
    console.log('   ✅ 文章生成完成');
    return article;
    
  } catch (error) {
    console.error('   ❌ 笔杆子 agent 调用失败:', error.message);
    console.log('   🔄 回退到直接 LLM 调用...');
    return await writeArticleWithLLM(prompt, topic);
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
  const frontmatter = `---
title: "${title}"
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
  
  // 保存
  const articlePath = path.join(outputDir, 'article.md');
  fs.writeFileSync(articlePath, articleWithFrontmatter);
  
  console.log(`\n✅ 文章保存完成：${articlePath}`);
  console.log(`📊 字数：${articleWithFrontmatter.length} 字符`);
  
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
