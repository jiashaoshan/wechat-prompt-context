#!/usr/bin/env node
/**
 * wechat-prompt-context 主入口
 * 完整工作流：分析主题 → 生成提示词 → 用户确认 → 生成文章 → 发布
 */

const fs = require('fs');
const path = require('path');

const { analyzeTopic } = require('./analyze-topic');
const { extractPrompt } = require('./extract-prompt');
const { generatePrompt } = require('./generate-prompt');
const { promptConfirmationLoop } = require('./confirm-prompt');
const { main: writeArticleMain } = require('./write-article');
const { publish } = require('./publish');

// 加载配置
function loadConfig() {
  const configPath = path.join(__dirname, '../config/default.yaml');
  if (fs.existsSync(configPath)) {
    const yaml = require('js-yaml');
    return yaml.load(fs.readFileSync(configPath, 'utf8'));
  }
  return {};
}

// 主函数
async function main(options = {}) {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     📝 微信公众号提示词写作助手                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  
  const startTime = Date.now();
  const config = loadConfig();
  
  // 获取输入
  const fuzzyTopic = options.topic;
  const exampleUrl = options.example;
  const theme = options.theme || config.defaults?.theme || 'pie';
  
  if (!fuzzyTopic) {
    console.error('❌ 请提供主题词');
    process.exit(1);
  }
  
  console.log('📋 输入信息：');
  console.log(`   主题词：${fuzzyTopic}`);
  if (exampleUrl) console.log(`   示例文章：${exampleUrl}`);
  console.log(`   发布主题：${theme}\n`);
  
  // 步骤1：分析主题
  console.log('📚 步骤 1/5：分析主题...');
  console.log('─────────────────────────────────');
  const topicAnalysis = await analyzeTopic(fuzzyTopic);
  console.log('─────────────────────────────────\n');
  
  // 步骤2：生成提示词
  console.log('📝 步骤 2/5：生成提示词...');
  console.log('─────────────────────────────────');
  
  let initialPrompt;
  let articleType = topicAnalysis.articleType || 'story';
  
  if (exampleUrl) {
    // 方式B：从示例文章反推
    console.log('   方式：示例文章反推');
    const extracted = await extractPrompt(exampleUrl);
    initialPrompt = extracted.prompt;
    articleType = extracted.articleType || articleType;
  } else {
    // 方式A：模板 + prompt-engineering-expert 优化
    console.log('   方式：模板 + 专家优化');
    initialPrompt = await generatePrompt(topicAnalysis.topic, articleType);
  }
  
  console.log('─────────────────────────────────\n');
  
  // 确保输出目录存在
  const outputDir = path.join(__dirname, '../output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 步骤3：用户确认
  console.log('✅ 步骤 3/5：确认提示词...');
  console.log('─────────────────────────────────');
  
  let confirmedPrompt;
  
  if (options.autoConfirm) {
    // 自动确认模式
    console.log('🤖 自动确认模式，跳过提示词确认');
    confirmedPrompt = initialPrompt;
    // 保存生成的提示词供查看
    fs.writeFileSync(path.join(outputDir, 'generated_prompt.txt'), initialPrompt);
    console.log('✅ 已自动确认提示词');
    console.log(`📝 提示词已保存至：output/generated_prompt.txt`);
  } else {
    // 交互式确认模式
    // 重新生成函数（用于确认循环）
    const regenerateFunc = async (feedback) => {
      console.log('\n🔄 重新生成提示词...');
      return await generatePrompt(topicAnalysis.topic, articleType, feedback);
    };
    
    confirmedPrompt = await promptConfirmationLoop(initialPrompt, regenerateFunc);
  }
  
  console.log('─────────────────────────────────\n');
  
  // 保存确认的提示词
  fs.writeFileSync(path.join(outputDir, 'confirmed_prompt.txt'), confirmedPrompt);
  
  // 步骤4：生成文章
  console.log('✍️ 步骤 4/5：生成文章...');
  console.log('─────────────────────────────────');
  const articlePath = await writeArticleMain(confirmedPrompt, topicAnalysis.topic);
  console.log('─────────────────────────────────\n');
  
  // 步骤5：发布
  console.log('📤 步骤 5/5：发布文章...');
  console.log('─────────────────────────────────');
  const publishResult = await publish(articlePath, theme);
  console.log('─────────────────────────────────\n');
  
  // 总结
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                   ✅ 全部完成！                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`⏱️  耗时：${duration}秒`);
  console.log(`📄 文章：${articlePath}`);
  console.log(`🎨 主题：${theme}`);
  console.log(`📊 状态：${publishResult.status}`);
  
  if (publishResult.status === 'published') {
    console.log('\n📱 请前往微信公众号后台查看草稿箱');
  }
  
  return {
    topic: topicAnalysis.topic,
    articlePath,
    theme,
    status: publishResult.status,
    duration
  };
}

// CLI
if (require.main === module) {
  // 解析参数
  const args = process.argv.slice(2);
  
  const topicArg = args.find(arg => arg.startsWith('--topic='));
  const exampleArg = args.find(arg => arg.startsWith('--example='));
  const themeArg = args.find(arg => arg.startsWith('--theme='));
  const autoConfirmArg = args.find(arg => arg === '--auto-confirm' || arg === '--auto');
  
  const options = {
    topic: topicArg ? topicArg.split('=')[1] : null,
    example: exampleArg ? exampleArg.split('=')[1] : null,
    theme: themeArg ? themeArg.split('=')[1] : null,
    autoConfirm: !!autoConfirmArg
  };
  
  if (!options.topic) {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     📝 微信公众号提示词写作助手                          ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    console.log('用法：');
    console.log('  node main.js --topic="主题词" [--example="示例链接"] [--theme="主题样式"] [--auto-confirm]\n');
    console.log('参数：');
    console.log('  --topic=xxx      模糊主题词（必填）');
    console.log('  --example=url    示例文章链接（可选）');
    console.log('  --theme=xxx      发布主题样式（可选，默认pie）');
    console.log('  --auto-confirm   自动确认模式，跳过提示词确认（可选）\n');
    console.log('示例：');
    console.log('  node main.js --topic="AI赚钱"');
    console.log('  node main.js --topic="AI赚钱" --example="https://mp.weixin.qq.com/s/xxx"');
    console.log('  node main.js --topic="AI赚钱" --theme=newsroom');
    console.log('  node main.js --topic="AI赚钱" --theme=newsroom --auto-confirm');
    process.exit(1);
  }
  
  main(options).catch((error) => {
    console.error('\n❌ 错误:', error.message);
    process.exit(1);
  });
}

module.exports = { main };
