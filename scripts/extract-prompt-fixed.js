#!/usr/bin/env node
/**
 * 从示例文章反推提示词（修复版 - 支持微信文章）
 * 输入：示例文章URL
 * 输出：文章提示词
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// 兼容 path.expanduser
path.expanduser = function(filepath) {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
};

// 主函数
async function extractPrompt(url) {
  console.log('🔗 从示例文章提取提示词...');
  
  // 获取文章
  const article = await fetchArticle(url);
  console.log(`   ✅ 获取成功：${article.title.substring(0, 30)}...`);
  console.log(`   文章内容长度：${article.content.length} 字符`);
  
  // 分析文章
  console.log('   分析文章结构和风格...');
  const analysis = await analyzeArticle(article);
  
  // 保存结果
  const outputDir = path.join(__dirname, '../output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(outputDir, 'extracted_prompt.json'),
    JSON.stringify(analysis, null, 2)
  );
  
  console.log('\n📌 提取结果：');
  console.log(`   话题：${analysis.topic}`);
  console.log(`   类型：${analysis.articleType}`);
  console.log(`   风格：${analysis.style.tone}`);
  console.log(`   字数：${analysis.wordCount}`);
  
  return {
    topic: analysis.topic,
    articleType: analysis.articleType,
    prompt: analysis.generatedPrompt
  };
}

// 获取文章内容
async function fetchArticle(url) {
  console.log(`   正在获取文章：${url.substring(0, 50)}...`);
  
  // 检测是否是微信文章
  const isWechatArticle = url.includes('mp.weixin.qq.com');
  
  if (isWechatArticle) {
    console.log('   检测到微信文章，使用浏览器自动化读取...');
    return await fetchWechatArticleWithBrowser(url);
  }
  
  // 普通网页使用 web_fetch
  try {
    const { web_fetch } = require('../../wechat-ai-writer/scripts/llm-client');
    const result = await web_fetch(url, { maxChars: 5000 });
    
    return {
      title: extractTitle(result.text),
      content: result.text
    };
  } catch (e) {
    console.log('   web_fetch 失败:', e.message);
    throw e;
  }
}

// 使用浏览器工具读取微信文章
async function fetchWechatArticleWithBrowser(url) {
  // 这里我们需要调用 OpenClaw 的 browser 工具
  // 由于无法直接调用 tool，我们使用一种变通方法：
  // 通过读取临时文件或标准输入来传递结果
  
  console.log('   请稍候，正在使用浏览器读取微信文章...');
  console.log('   (注意：此功能需要手动配合，请在主会话中使用 browser 工具读取文章)');
  
  // 创建一个临时文件来存储文章信息
  const tempFile = path.join(os.tmpdir(), 'wechat_article_temp.json');
  
  // 输出提示，让用户知道需要手动操作
  console.log(`\n⚠️  需要手动操作：`);
  console.log(`   请在主会话中运行以下命令来读取文章：`);
  console.log(`   browser open "${url}"`);
  console.log(`   browser snapshot <targetId> --max-chars 15000`);
  console.log(`   然后将内容保存到：${tempFile}`);
  
  // 由于无法直接调用 browser 工具，我们返回一个占位符
  // 实际使用时，应该在主会话中读取后传递给此脚本
  throw new Error('微信文章需要浏览器自动化读取，请使用主会话的 browser 工具');
}

// 提取标题
function extractTitle(text) {
  const lines = text.split('\n').filter(l => l.trim());
  return lines[0] || '未知标题';
}

// 使用LLM分析文章
async function analyzeArticle(article) {
  const { callLLM } = require('../../wechat-ai-writer/scripts/llm-client');
  
  const messages = [
    {
      role: 'system',
      content: '你是一位资深内容分析师，擅长分析文章结构和风格，提取创作方法论。'
    },
    {
      role: 'user',
      content: `请分析以下公众号文章，提取其创作提示词：

【文章标题】
${article.title}

【文章内容】
${article.content.substring(0, 4000)}

请输出JSON格式：
{
  "topic": "文章核心话题",
  "articleType": "文章类型（story/analysis/list/opinion）",
  "style": {
    "tone": "语气（口语化/专业/犀利等）",
    "features": ["风格特点1", "风格特点2"]
  },
  "structure": {
    "beginning": "开头怎么写",
    "body": "正文结构",
    "ending": "结尾怎么收"
  },
  "techniques": ["技巧1", "技巧2", "技巧3"],
  "wordCount": "推荐字数",
  "generatedPrompt": "完整的创作提示词（让AI能写出类似风格）"
}

只输出JSON，不要其他文字。`
    }
  ];
  
  const response = await callLLM(messages, { maxTokens: 2048 });
  
  // 解析JSON
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (e) {
    console.error('解析分析结果失败:', e.message);
    return {
      topic: article.title,
      articleType: 'story',
      style: { tone: '口语化', features: ['故事化'] },
      structure: { beginning: '场景引入', body: '案例分析', ending: '温暖升华' },
      techniques: ['金句', '案例'],
      wordCount: '1500-2000',
      generatedPrompt: `写一篇关于"${article.title}"的文章，口语化风格，有故事感。`
    };
  }
}

// CLI
if (require.main === module) {
  const url = process.argv[2];
  const contentFile = process.argv[3]; // 可选：预读取的文章内容文件
  
  if (!url) {
    console.log('Usage: node extract-prompt.js "https://mp.weixin.qq.com/s/xxx" [content_file]');
    console.log('');
    console.log('对于微信文章，建议先使用 browser 工具读取内容，然后传入内容文件：');
    console.log('  1. browser open "https://mp.weixin.qq.com/s/xxx"');
    console.log('  2. browser snapshot <targetId> --max-chars 15000 > article.txt');
    console.log('  3. node extract-prompt.js "https://mp.weixin.qq.com/s/xxx" article.txt');
    process.exit(1);
  }
  
  // 如果提供了内容文件，直接读取
  if (contentFile && fs.existsSync(contentFile)) {
    const content = fs.readFileSync(contentFile, 'utf8');
    const title = content.split('\n').filter(l => l.trim())[0] || '未知标题';
    
    const article = { title, content };
    console.log(`   ✅ 从文件读取成功：${title.substring(0, 30)}...`);
    
    analyzeArticle(article).then(analysis => {
      const outputDir = path.join(__dirname, '../output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(
        path.join(outputDir, 'extracted_prompt.json'),
        JSON.stringify(analysis, null, 2)
      );
      
      console.log('\n📌 提取结果：');
      console.log(`   话题：${analysis.topic}`);
      console.log(`   类型：${analysis.articleType}`);
      console.log(`   风格：${analysis.style.tone}`);
      console.log(`   字数：${analysis.wordCount}`);
    }).catch(console.error);
  } else {
    extractPrompt(url).catch(console.error);
  }
}

module.exports = { extractPrompt };
