#!/usr/bin/env node
/**
 * 步骤5：发布到公众号
 * 使用指定主题（默认pie）发布到公众号草稿箱
 * 
 * 幂等性保护：同一文章5分钟内不重复发布
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');

// 修复 TDZ 问题：使用独立函数替代修改原生 path
function expandUser(filepath) {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

// 发布记录文件路径
const PUBLISH_HISTORY_FILE = path.join(os.homedir(), '.openclaw/workspace/.publish-history.json');
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5分钟去重窗口

// 计算文件指纹（MD5）
function getFileFingerprint(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (e) {
    return null;
  }
}

// 加载发布历史
function loadPublishHistory() {
  try {
    if (fs.existsSync(PUBLISH_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(PUBLISH_HISTORY_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('   ⚠️ 加载发布历史失败，使用空记录');
  }
  return {};
}

// 保存发布历史
function savePublishHistory(history) {
  try {
    fs.writeFileSync(PUBLISH_HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (e) {
    console.log('   ⚠️ 保存发布历史失败');
  }
}

// 检查是否最近已发布（幂等性检查）
function isRecentlyPublished(filePath) {
  const fingerprint = getFileFingerprint(filePath);
  if (!fingerprint) return false;
  
  const history = loadPublishHistory();
  const lastPublish = history[fingerprint];
  
  if (lastPublish) {
    const elapsed = Date.now() - lastPublish.timestamp;
    if (elapsed < DEDUP_WINDOW_MS) {
      const remaining = Math.ceil((DEDUP_WINDOW_MS - elapsed) / 1000);
      console.log(`   ⚠️ 该文章 ${Math.floor(elapsed/1000)} 秒前已发布过`);
      console.log(`   ⏳ 去重窗口剩余 ${remaining} 秒，跳过发布`);
      return true;
    }
  }
  
  return false;
}

// 记录发布成功
function recordPublish(filePath) {
  const fingerprint = getFileFingerprint(filePath);
  if (!fingerprint) return;
  
  const history = loadPublishHistory();
  history[fingerprint] = {
    timestamp: Date.now(),
    path: filePath
  };
  
  // 清理超过1小时的记录
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const key in history) {
    if (history[key].timestamp < oneHourAgo) {
      delete history[key];
    }
  }
  
  savePublishHistory(history);
}

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
  
  // 幂等性检查：5分钟内不重复发布同一文章
  if (isRecentlyPublished(articlePath)) {
    return { status: 'skipped', reason: 'recently_published', path: articlePath };
  }
  
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
      timeout: 300000,  // 5分钟超时，避免实际已发布但返回超时导致重试
      env: { ...process.env }
    });
    
    console.log('✅ 发布成功！');
    console.log('📱 请前往微信公众号后台查看草稿箱');
    
    // 记录发布成功，用于幂等性保护
    recordPublish(articlePath);
    
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
  
  publish(articlePath, theme).then(result => {
    if (result.status === 'skipped') {
      console.log('\n⏭️  跳过发布（已存在）');
      process.exit(0);
    } else if (result.status === 'error') {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }).catch(err => {
    console.error('❌ 发布异常:', err.message);
    process.exit(1);
  });
}

module.exports = { publish };
