#!/usr/bin/env node
/**
 * 步骤4：生成完整文章
 * 根据确认的提示词，调用大模型生成文章
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

// 调用LLM生成文章
async function writeArticle(prompt, topic) {
  console.log('✍️ 正在生成文章...');
  
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

// 添加Frontmatter
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
  
  // 创建默认洞见
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
  
  // 生成文章
  const article = await writeArticle(prompt, topic);
  
  // 添加Frontmatter
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

module.exports = { writeArticle, main };
