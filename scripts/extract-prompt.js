#!/usr/bin/env node
/**
 * 从示例文章反推提示词
 * 输入：示例文章URL
 * 输出：文章提示词
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// 修复 TDZ 问题：使用独立函数替代修改原生 path
function expandUser(filepath) {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

// 获取文章内容
async function fetchArticle(url) {
  console.log(`   正在获取文章：${url.substring(0, 50)}...`);
  
  // 检测是否是微信文章
  const isWechatArticle = url.includes('mp.weixin.qq.com');
  
  if (isWechatArticle) {
    console.log('   检测到微信文章，使用浏览器自动化读取...');
    return await fetchWechatArticle(url);
  }
  
  try {
    // 使用 web_fetch 工具
    const { web_fetch } = require('../../wechat-ai-writer/scripts/llm-client');
    const result = await web_fetch(url, { maxChars: 5000 });
    
    return {
      title: extractTitle(result.text),
      content: result.text
    };
  } catch (e) {
    console.log('   web_fetch 失败，尝试其他方式...');
    
    // 简单HTTP获取
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          // 简单提取文本
          const text = data.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          resolve({
            title: extractTitle(text),
            content: text.substring(0, 5000)
          });
        });
      }).on('error', reject);
    });
  }
}

// 使用浏览器自动化读取微信文章
async function fetchWechatArticle(url) {
  try {
    // 使用 OpenClaw 的 browser 工具（通过 API）
    const axios = require('axios');
    
    // 打开页面
    console.log('   正在打开浏览器...');
    const openRes = await axios.post('http://127.0.0.1:18800/browser/open', {
      url: url,
      profile: 'openclaw'
    });
    const targetId = openRes.data.targetId;
    
    console.log(`   浏览器页面已打开: ${targetId}`);
    
    // 等待页面加载（微信文章需要较长时间）
    await new Promise(r => setTimeout(r, 5000));
    
    // 获取页面内容
    const snapshotRes = await axios.post('http://127.0.0.1:18800/browser/snapshot', {
      targetId: targetId,
      maxChars: 15000
    });
    
    // 关闭页面
    try {
      await axios.post('http://127.0.0.1:18800/browser/close', {
        targetId: targetId
      });
    } catch (e) {
      // 忽略关闭错误
    }
    
    // 提取标题和内容
    const content = snapshotRes.data.text || '';
    const title = extractTitleFromWechat(content) || extractTitle(content);
    
    return {
      title: title,
      content: content
    };
  } catch (e) {
    console.error('   浏览器读取失败:', e.message);
    // 降级到使用 wechat-reader 技能
    return await fetchWithWechatReader(url);
  }
}

// 使用 wechat-reader 技能读取
async function fetchWithWechatReader(url) {
  console.log('   尝试使用 wechat-reader 技能...');
  
  // 检查 wechat-reader 是否存在
  const readerPath = path.join(__dirname, '../../wechat-reader');
  if (!fs.existsSync(readerPath)) {
    throw new Error('wechat-reader 技能未安装');
  }
  
  // 使用 wechat-reader 的读取逻辑
  const { execSync } = require('child_process');
  
  try {
    // 调用 wechat-toolkit 的读取功能
    const result = execSync(
      `cd ${readerPath} && node -e "
        const { readArticle } = require('./scripts/reader');
        readArticle('${url}').then(r => console.log(JSON.stringify(r))).catch(e => console.error(e));
      "`,
      { encoding: 'utf8', timeout: 60000 }
    );
    
    const article = JSON.parse(result);
    return {
      title: article.title || extractTitle(article.content),
      content: article.content || article.text || ''
    };
  } catch (e) {
    console.error('   wechat-reader 也失败了:', e.message);
    throw e;
  }
}

// 从微信文章内容中提取标题
function extractTitleFromWechat(text) {
  // 微信文章标题通常在文章开头
  const lines = text.split('\n').filter(l => l.trim());
  
  // 查找可能的标题（通常是第一个非空行，且不是"Original"、作者名等）
  for (const line of lines.slice(0, 10)) {
    const trimmed = line.trim();
    // 排除常见的非标题行
    if (trimmed && 
        trimmed !== 'Original' && 
        !trimmed.includes('javascript:void(0)') &&
        !trimmed.includes('继续滑动') &&
        !trimmed.includes('轻触阅读原文') &&
        !trimmed.includes('向上滑动') &&
        trimmed.length > 5 &&
        trimmed.length < 100) {
      return trimmed;
    }
  }
  
  return null;
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
${article.content.substring(0, 3000)}

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

// 主函数
async function extractPrompt(url) {
  console.log('🔗 从示例文章提取提示词...');
  
  // 获取文章
  const article = await fetchArticle(url);
  console.log(`   ✅ 获取成功：${article.title.substring(0, 30)}...`);
  
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
  
  return {
    topic: analysis.topic,
    articleType: analysis.articleType,
    prompt: analysis.generatedPrompt
  };
}

// CLI
if (require.main === module) {
  const url = process.argv[2];
  if (!url) {
    console.log('Usage: node extract-prompt.js "https://mp.weixin.qq.com/s/xxx"');
    process.exit(1);
  }
  
  extractPrompt(url).catch(console.error);
}

module.exports = { extractPrompt };
