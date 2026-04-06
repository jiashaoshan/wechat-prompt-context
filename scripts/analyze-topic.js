#!/usr/bin/env node
/**
 * 步骤1：分析主题
 * 搜索小红书/公众号/知乎高赞，使用笔杆子 agent 分析生成文章主题
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

// 搜索小红书高赞
async function searchXiaohongshuHot(topic, maxResults = 5) {
  // 方案1: 尝试使用 Python Playwright 脚本
  try {
    const scriptPath = expandUser('~/.openclaw/workspace/skills/xiaohongshu-search-summarizer/scripts/search_xiaohongshu.py');
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
    const searchScript = expandUser('~/.openclaw/workspace/skills/wechat-article-search/scripts/search_wechat.js');
    const result = execSync(`node "${searchScript}" "${topic}" -n ${maxResults}`, { encoding: 'utf8' });
    const data = JSON.parse(result);
    return (data.articles || []).map(a => ({ title: a.title, summary: a.summary }));
  } catch (e) {
    console.log('   ⚠️ 公众号搜索失败:', e.message);
    return [];
  }
}

// 调用笔杆子 agent 分析
async function analyzeWithAgent(topic, xiaohongshu, zhihu, wechat) {
  console.log('   → 调用笔杆子 agent 分析...');
  
  // 构建提示词
  const prompt = `你是一位资深内容策划，擅长分析热点话题，提炼最佳文章角度。

基于以下关于"${topic}"的高赞内容，分析最佳文章角度：

【小红书高赞】
${xiaohongshu.slice(0, 3).map((x, i) => `${i + 1}. ${x.title}`).join('\n')}

【知乎高赞】
${zhihu.slice(0, 3).map((z, i) => `${i + 1}. ${z.title}`).join('\n')}

【公众号高赞】
${wechat.slice(0, 3).map((w, i) => `${i + 1}. ${w.title}`).join('\n')}

请输出JSON格式：
{
  "topic": "推荐文章主题（具体、有吸引力）",
  "articleType": "推荐文章类型（story/analysis/list/opinion/tech-report）",
  "targetAudience": "目标读者画像",
  "sellingPoint": "核心卖点/钩子（一句话）",
  "angle": "独特角度（与现有文章的区别）"
}

文章类型选择指南：
- story: 情感、人物、个人经历
- analysis: 趋势分析、行业观察
- list: 干货清单、方法论
- opinion: 观点评论、思考
- tech-report: 科技产品深度报道、创业故事+商业模式分析（如AI硬件、创新产品、科技公司）
- marketing-trend: 消费趋势洞察、品牌营销案例、新消费现象分析（如品类崛起、人群变迁、品牌策略）
- investigation: 深度调查报道、社会纪实（如事故调查、政策后遗症、边缘群体、环境灾难、职业纪实、城乡变迁）
- cinema-culture: 影视评论、文化分析（如票房现象、类型片研究、电影文化基因、影视产业观察）
- lifestyle-healing: 生活方式、心灵疗愈（如独处美学、社交边界、心理疗愈、人生哲学、中年危机、反内卷）
- edu-course: 教育类课程推广（如知识付费、亲子教育、素质教育、研学旅行、课程营销软文）
- industry-evolution: 行业趋势、职业演进（如岗位消亡预警、技术变革分析、职业演进史、新职业定义、组织能力重构）

只输出JSON，不要其他文字。`;

  // 保存提示词到临时文件
  const tempDir = path.join(__dirname, '../output');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const promptPath = path.join(tempDir, 'analyze_prompt.txt');
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
    let response = '';
    try {
      const parsed = JSON.parse(result);
      if (parsed.result && parsed.result.payloads && parsed.result.payloads.length > 0) {
        response = parsed.result.payloads.map(p => p.text || '').join('\n');
      } else if (parsed.text) {
        response = parsed.text;
      }
    } catch (e) {
      response = result;
    }

    // 解析JSON
    let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('   ✅ 笔杆子 agent 分析成功');
      return parsed;
    }
    
    // 尝试直接解析
    const parsed = JSON.parse(cleaned);
    console.log('   ✅ 笔杆子 agent 分析成功');
    return parsed;
    
  } catch (e) {
    console.error('   ⚠️ 笔杆子 agent 分析失败:', e.message);
    // 返回默认值
    return {
      topic: topic,
      articleType: 'story',
      targetAudience: '对' + topic + '感兴趣的读者',
      sellingPoint: topic + '的真相',
      angle: '深度分析'
    };
  }
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
  
  // 笔杆子 agent 分析
  console.log('   智能分析中...');
  const analysis = await analyzeWithAgent(fuzzyTopic, xiaohongshu, zhihu, wechat);
  
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