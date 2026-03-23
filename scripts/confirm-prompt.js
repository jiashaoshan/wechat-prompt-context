#!/usr/bin/env node
/**
 * 步骤3：用户确认提示词
 * 展示提示词，等待用户确认或修改
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 展示提示词
function displayPrompt(prompt) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              📝 生成的文章提示词                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(prompt);
  console.log('\n───────────────────────────────────────────────────────────');
}

// 询问用户
async function askUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// 确认提示词
async function confirmPrompt(prompt) {
  displayPrompt(prompt);
  
  console.log('\n💡 选项：');
  console.log('   [yes/y]   确认使用此提示词');
  console.log('   [modify/m] 提出修改意见，重新生成');
  console.log('   [view/v]   查看当前提示词（再次显示）');
  console.log('   [quit/q]   退出程序\n');
  
  const answer = await askUser('请输入选项：');
  
  const lowerAnswer = answer.toLowerCase();
  
  if (lowerAnswer === 'yes' || lowerAnswer === 'y') {
    return { confirmed: true, prompt };
  } else if (lowerAnswer === 'modify' || lowerAnswer === 'm') {
    const feedback = await askUser('\n请输入修改意见（如：增加案例、调整语气、更口语化等）：');
    return { confirmed: false, feedback };
  } else if (lowerAnswer === 'view' || lowerAnswer === 'v') {
    return { confirmed: false, action: 'view' };
  } else if (lowerAnswer === 'quit' || lowerAnswer === 'q') {
    console.log('\n👋 已退出');
    process.exit(0);
  } else {
    console.log('\n⚠️ 无效选项，请重新选择');
    return { confirmed: false, action: 'invalid' };
  }
}

// 确认循环
async function promptConfirmationLoop(prompt, generateFunc) {
  let currentPrompt = prompt;
  let attempt = 1;
  const maxAttempts = 5;
  
  while (attempt <= maxAttempts) {
    console.log(`\n📌 第 ${attempt}/${maxAttempts} 轮确认`);
    
    const result = await confirmPrompt(currentPrompt);
    
    if (result.confirmed) {
      console.log('\n✅ 提示词已确认！');
      return currentPrompt;
    }
    
    if (result.action === 'view') {
      // 重新显示，不增加尝试次数
      continue;
    }
    
    if (result.action === 'invalid') {
      // 无效选项，不增加尝试次数
      continue;
    }
    
    // 用户提出修改意见
    console.log('\n🔄 根据反馈重新生成提示词...');
    console.log(`   修改意见：${result.feedback}`);
    
    // 调用重新生成函数
    currentPrompt = await generateFunc(result.feedback);
    attempt++;
  }
  
  console.log('\n⚠️ 已达到最大尝试次数，使用最后一次生成的提示词');
  return currentPrompt;
}

// CLI
if (require.main === module) {
  const promptPath = process.argv[2];
  if (!promptPath) {
    console.log('Usage: node confirm-prompt.js "path/to/prompt.txt"');
    process.exit(1);
  }
  
  const prompt = fs.readFileSync(promptPath, 'utf8');
  
  // 模拟重新生成函数
  const mockRegenerate = async (feedback) => {
    console.log('   （模拟重新生成，实际应调用 generate-prompt.js）');
    return prompt + '\n\n<!-- 根据反馈修改：' + feedback + ' -->';
  };
  
  promptConfirmationLoop(prompt, mockRegenerate).then((confirmedPrompt) => {
    console.log('\n最终确认的提示词：');
    console.log(confirmedPrompt);
  }).catch(console.error);
}

module.exports = { confirmPrompt, promptConfirmationLoop };
