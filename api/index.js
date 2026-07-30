'use strict';

// Vercel 无服务器函数入口。
// vercel.json 的 routes 把 /eva/api/(.*) 转发到本函数。但 Vercel 在不同场景下传给函数的
// req.url 形态不一：可能是 /eva/api/meta（保留前缀）、/api/meta、或 /meta（剥离了 /api 挂载）。
// 这里做「全兼容归一化」，无论哪种形态都映射到 Express 内部的 /api/* 路由。
//
// 为便于排查部署期错误：模块加载期与请求期的异常都被捕获，
// 以 JSON 返回真实错误信息（而不是 Vercel 的通用 500/404 文本），同时 console.error 写入日志。

function normalizeUrl(url) {
  if (!url) return '/';
  let u = url;
  // 1) 剥掉子路径前缀 /eva  （/eva/api/meta -> /api/meta ；/eva/ -> /）
  if (u.startsWith('/eva')) u = u.slice(4) || '/';
  // 2) 若 Vercel 已剥离 /api 挂载，仅剩 /meta，则补回 /api 前缀
  if (u !== '/' && !u.startsWith('/api')) u = '/api' + u;
  return u;
}

let app = null;
let loadError = null;
try {
  app = require('../server/app');
} catch (e) {
  loadError = e;
  console.error('[api/index.js] 模块加载失败:', e && e.stack ? e.stack : e);
}

module.exports = (req, res) => {
  if (loadError || !app) {
    res.status(500).json({
      error: '服务模块加载失败（依赖未安装或配置缺失）',
      detail: (loadError && loadError.message) || String(loadError),
      stack: loadError && loadError.stack
    });
    return;
  }
  try {
    req.url = normalizeUrl(req.url);
    return app(req, res);
  } catch (e) {
    console.error('[api/index.js] 请求处理异常:', e && e.stack ? e.stack : e);
    if (!res.headersSent) {
      res.status(500).json({ error: '请求处理异常', detail: e && e.message });
    }
  }
};
