#!/usr/bin/env node
/**
 * 步骤5：发布到公众号
 * 使用指定主题（默认pie）发布到公众号草稿箱
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 兼容 path.expanduser
path.expanduser = function(filepath) {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
};

// 查找发布脚本
function findPublisherScript() {
  // 优先使用 wechat-mp-publisher
  const mpPublisherPath = path.join(
    os.homedir(),
    '.openclaw/workspace/skills/wechat-mp-publisher/scripts/publish.sh'
  );
  
  if (fs.existsSync(mpPublisherPath)) {
    return { path: mpPublisherPath, type: 'shell' };
  }
  
  // 备选 wechat-toolkit
  const toolkitPath = path.join(
    os.homedir(),
    '.openclaw/workspace/skills/wechat-toolkit/scripts/publisher/publish.js'
  );
  
  if (fs.existsSync(toolkitPath)) {
    return { path: toolkitPath, type: 'node' };
  }
  
  return null;
}

// 发布文章
async function publish(articlePath, theme = 'pie') {
  console.log('📤 准备发布文章...');
  console.log(`   文章：${articlePath}`);
  console.log(`   主题：${theme}`);
  
  // 检查环境变量
  if (!process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) {
    console.error('❌ 环境变量未设置！');
    console.log('💡 请先设置：');
    console.log('   export WECHAT_APP_ID="your_app_id"');
    console.log('   export WECHAT_APP_SECRET="your_app_secret"');
    return { status: 'error', error: 'env_not_set' };
  }
  
  // 查找发布脚本
  const publisher = findPublisherScript();
  if (!publisher) {
    console.error('❌ 未找到发布技能');
    return { status: 'error', error: 'publisher_not_found' };
  }
  
  console.log(`   使用：${publisher.type === 'shell' ? 'wechat-mp-publisher' : 'wechat-toolkit'}`);
  
  try {
    // 构建命令
    let cmd;
    if (publisher.type === 'shell') {
      // wechat-mp-publisher shell 脚本
      cmd = `bash "${publisher.path}" "${articlePath}"`;
    } else {
      // wechat-toolkit node 脚本
      cmd = `node "${publisher.path}" "${articlePath}" ${theme}`;
    }
    
    console.log('🚀 正在推送到公众号草稿箱...');
    
    const result = execSync(cmd, {
      encoding: 'utf8',
      timeout: 60000,
      env: { ...process.env }
    });
    
    console.log('✅ 发布成功！');
    console.log('📱 请前往微信公众号后台查看草稿箱');
    
    return {
      status: 'published',
      path: articlePath,
      theme: theme,
      output: result
    };
    
  } catch (e) {
    console.error('❌ 发布失败:', e.message);
    
    if (e.message.includes('IP')) {
      console.log('💡 提示：IP不在白名单，请先将当前IP添加到公众号后台');
    }
    if (e.message.includes('token')) {
      console.log('💡 提示：Token失效，请检查 WECHAT_APP_ID 和 WECHAT_APP_SECRET');
    }
    
    return { status: 'error', error: e.message };
  }
}

// CLI
if (require.main === module) {
  const articlePath = process.argv[2];
  const theme = process.argv[3] || 'pie';
  
  if (!articlePath) {
    console.log('Usage: node publish.js "path/to/article.md" [theme]');
    console.log('Themes: pie, lapis, orangeheart, newsroom, aurora, sage, ember');
    process.exit(1);
  }
  
  if (!fs.existsSync(articlePath)) {
    console.error('❌ 文章文件不存在:', articlePath);
    process.exit(1);
  }
  
  publish(articlePath, theme).catch(console.error);
}

module.exports = { publish };
