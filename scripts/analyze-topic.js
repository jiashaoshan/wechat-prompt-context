#!/usr/bin/env node
/**
 * 步骤1：分析主题
 * 搜索小红书/公众号/知乎高赞，智能分析生成文章主题
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

// 搜索小红书高赞
async function searchXiaohongshuHot(topic, maxResults = 5) {
  // 方案1: 尝试使用 Python Playwright 脚本
  try {
    const scriptPath = path.expanduser('~/.openclaw/workspace/skills/xiaohongshu-search-summarizer/scripts/search_xiaohongshu.py');
    const { execSync } = require('child_process');
    const result = execSync(`python3 "${scriptPath}" "${topic}" ${maxResults}`, { 
      encoding: 'utf8',
      timeout: 60000
    });
    const data = JSON.parse(result);
    if (data && data.length > 0 && data[0].title !== '无标题') {
      console.log(`   ✅ Python 脚本搜索成功，找到 ${data.length} 篇`);
      return data.map(r => ({ title: r.title, summary: r.summary }));
    }
    throw new Error('Python 脚本未获取到有效数据');
  } catch (e) {
    console.log('   ⚠️ Python 脚本搜索失败:', e.message);
  }
  
  // 方案2: 降级到 Tavily 搜索
  console.log('   降级到 Tavily 搜索...');
  try {
    const { searchXiaohongshu } = require('../../wechat-ai-writer/scripts/tavily-search');
    const results = await searchXiaohongshu(topic, maxResults);
    if (results && results.length > 0) {
      console.log(`   ✅ Tavily 搜索成功，找到 ${results.length} 篇`);
      return results.map(r => ({ title: r.title, summary: r.summary }));
    }
    throw new Error('Tavily 未返回结果');
  } catch (e2) {
    console.log('   ⚠️ Tavily 搜索也失败:', e2.message);
    return [];
  }
}

// 解析小红书 raw_data.md 文件
function parseXiaohongshuRawData(content) {
  const posts = [];
  const sections = content.split(/\n## \d+\./);
  
  for (const section of sections.slice(1)) {
    const lines = section.trim().split('\n');
    let title = '';
    let summary = '';
    
    for (const line of lines) {
      if (line.startsWith('**标题**:')) {
        title = line.replace('**标题**:', '').trim();
      } else if (line.startsWith('**描述**:')) {
        summary = line.replace('**描述**:', '').trim();
      } else if (line.startsWith('**内容**:')) {
        if (!summary) summary = line.replace('**内容**:', '').trim();
      }
    }
    
    if (title) {
      posts.push({ title, summary: summary || '无摘要' });
    }
  }
  
  return posts;
}

// 搜索知乎高赞
async function searchZhihuHot(topic, maxResults = 5) {
  try {
    const { searchZhihu } = require('../../wechat-ai-writer/scripts/tavily-search');
    const results = await searchZhihu(topic, maxResults);
    return results.map(r => ({ title: r.title, summary: r.summary }));
  } catch (e) {
    console.log('   ⚠️ 知乎搜索失败:', e.message);
    return [];
  }
}

// 搜索公众号高赞
async function searchWechatHot(topic, maxResults = 5) {
  try {
    const searchScript = path.expanduser('~/.openclaw/workspace/skills/wechat-article-search/scripts/search_wechat.js');
    const { execSync } = require('child_process');
    const result = execSync(`node "${searchScript}" "${topic}" -n ${maxResults}`, { encoding: 'utf8' });
    const data = JSON.parse(result);
    return (data.articles || []).map(a => ({ title: a.title, summary: a.summary }));
  } catch (e) {
    console.log('   ⚠️ 公众号搜索失败:', e.message);
    return [];
  }
}

// 调用LLM分析
async function analyzeWithLLM(topic, xiaohongshu, zhihu, wechat) {
  const { callLLM } = require('../../wechat-ai-writer/scripts/llm-client');
  
  const messages = [
    {
      role: 'system',
      content: '你是一位资深内容策划，擅长分析热点话题，提炼最佳文章角度。'
    },
    {
      role: 'user',
      content: `基于以下关于"${topic}"的高赞内容，分析最佳文章角度：

【小红书高赞】
${xiaohongshu.slice(0, 3).map((x, i) => `${i + 1}. ${x.title}`).join('\n')}

【知乎高赞】
${zhihu.slice(0, 3).map((z, i) => `${i + 1}. ${z.title}`).join('\n')}

【公众号高赞】
${wechat.slice(0, 3).map((w, i) => `${i + 1}. ${w.title}`).join('\n')}

请输出JSON格式：
{
  "topic": "推荐文章主题（具体、有吸引力）",
  "articleType": "推荐文章类型（story/analysis/list/opinion）",
  "targetAudience": "目标读者画像",
  "sellingPoint": "核心卖点/钩子（一句话）",
  "angle": "独特角度（与现有文章的区别）"
}

只输出JSON，不要其他文字。`
    }
  ];
  
  // 重试机制
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await callLLM(messages, { maxTokens: 2048 });
      
      // 解析JSON
      let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('   ✅ LLM 分析成功');
        return parsed;
      }
      const parsed = JSON.parse(cleaned);
      console.log('   ✅ LLM 分析成功');
      return parsed;
    } catch (e) {
      lastError = e;
      console.log(`   ⚠️ 第 ${attempt + 1} 次解析失败: ${e.message}`);
      if (attempt < 2) {
        console.log('   重试中...');
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  
  console.error('解析分析结果失败，使用默认值');
  console.error('最后错误:', lastError.message);
  return {
    topic: topic,
    articleType: 'story',
    targetAudience: '对' + topic + '感兴趣的读者',
    sellingPoint: topic + '的真相',
    angle: '深度分析'
  };
}

// 主函数
async function analyzeTopic(fuzzyTopic) {
  console.log(`🔍 分析主题：${fuzzyTopic}`);
  
  // 并行搜索
  console.log('   搜索小红书高赞...');
  const xiaohongshu = await searchXiaohongshuHot(fuzzyTopic);
  console.log(`   ✅ 找到 ${xiaohongshu.length} 篇`);
  
  console.log('   搜索知乎高赞...');
  const zhihu = await searchZhihuHot(fuzzyTopic);
  console.log(`   ✅ 找到 ${zhihu.length} 篇`);
  
  console.log('   搜索公众号高赞...');
  const wechat = await searchWechatHot(fuzzyTopic);
  console.log(`   ✅ 找到 ${wechat.length} 篇`);
  
  // LLM分析
  console.log('   智能分析中...');
  const analysis = await analyzeWithLLM(fuzzyTopic, xiaohongshu, zhihu, wechat);
  
  // 保存结果
  const outputDir = path.join(__dirname, '../output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 保存分析结果
  fs.writeFileSync(
    path.join(outputDir, 'topic_analysis.json'),
    JSON.stringify(analysis, null, 2)
  );
  
  // 保存搜索的原始文章
  fs.writeFileSync(
    path.join(outputDir, 'search_results.json'),
    JSON.stringify({
      topic: fuzzyTopic,
      timestamp: new Date().toISOString(),
      xiaohongshu: xiaohongshu,
      zhihu: zhihu,
      wechat: wechat
    }, null, 2)
  );
  
  console.log('\n📌 分析结果：');
  console.log(`   推荐主题：${analysis.topic}`);
  console.log(`   文章类型：${analysis.articleType}`);
  console.log(`   目标读者：${analysis.targetAudience}`);
  console.log(`   核心卖点：${analysis.sellingPoint}`);
  
  return analysis;
}

// CLI
if (require.main === module) {
  const topic = process.argv[2];
  if (!topic) {
    console.log('Usage: node analyze-topic.js "模糊主题词"');
    process.exit(1);
  }
  
  analyzeTopic(topic).catch(console.error);
}

module.exports = { analyzeTopic };
