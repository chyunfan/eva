'use strict';

const fs = require('fs');
const path = require('path');

// 极简 .env 加载（无第三方依赖）：若存在 .env 则读取其中的环境变量。
// 部署平台（Vercel 等）通常直接注入真实环境变量，此函数仅用于本地/服务器便利。
// 注意：.env 属于敏感文件，已被服务端中间件禁止通过 HTTP 访问。
function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

// 配置加载：优先读取 config.json（可修改的部署配置），并提供合理默认值。
// 复制 config.example.json 为 config.json 后即可修改数据库连接、企业微信等参数。
function loadConfig() {
  loadDotEnv();
  const example = path.join(__dirname, '..', 'config.example.json');
  const file = path.join(__dirname, '..', 'config.json');
  let cfg;
  if (fs.existsSync(file)) {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else if (fs.existsSync(example)) {
    cfg = JSON.parse(fs.readFileSync(example, 'utf8'));
  } else {
    throw new Error('缺少配置文件 config.json / config.example.json');
  }

  // 允许用环境变量覆盖关键项（容器/内网部署常用）
  if (process.env.DEPLOY) cfg.deploy = process.env.DEPLOY;
  if (process.env.PORT) cfg.server = Object.assign({}, cfg.server, { port: Number(process.env.PORT) });

  const defaults = {
    server: { port: 3000 },
    deploy: 'memory',
    abilities: ['领导能力', '分析决策', '执行控制', '组织协调', '参谋作用'],
    scoreOptions: [20, 19, 18, 17, 16, 15],
    quarter: '2026Q2',
    supabase: {},
    db2: {},
    wecom: { enabled: false }
  };

  const merged = {
    ...defaults,
    ...cfg,
    server: { ...defaults.server, ...(cfg.server || {}) },
    db2: { ...defaults.db2, ...(cfg.db2 || {}) },
    wecom: { ...defaults.wecom, ...(cfg.wecom || {}) }
  };

  // Supabase（外网）连接信息一律来自环境变量，不在 config.json 中保存密钥。
  // 优先级：环境变量 > config.json 中的占位值。
  //   SUPABASE_URL                 必填
  //   SUPABASE_SERVICE_ROLE_KEY    必填（服务端写入用，权限最高，仅存于服务端）
  //   SUPABASE_ANON_KEY            可选（仅当未提供 service role key 时回退使用）
  merged.supabase = {
    url: process.env.SUPABASE_URL || (cfg.supabase && cfg.supabase.url) || '',
    serviceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_KEY ||
      (cfg.supabase && cfg.supabase.serviceRoleKey) || '',
    anonKey:
      process.env.SUPABASE_ANON_KEY ||
      (cfg.supabase && cfg.supabase.anonKey) || ''
  };

  // 启动前检查：外网模式必须能从环境变量拿到 Supabase 凭据，否则明确报错。
  if (merged.deploy === 'supabase') {
    if (!merged.supabase.url || (!merged.supabase.serviceRoleKey && !merged.supabase.anonKey)) {
      console.error(
        '[配置错误] 当前 deploy=supabase，但缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY。' +
        '请在运行环境（.env 或平台环境变量）中配置，config.json 不保存 Supabase 密钥。'
      );
    }
  }

  return merged;
}

module.exports = { loadConfig };
