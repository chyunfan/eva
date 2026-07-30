'use strict';

// Vercel 无服务器函数入口。
// vercel.json 的 routes 把 /eva/api/(.*) 转发到本函数，并保留原始 req.url（含 /eva 前缀）。
// 这里剥掉 /eva 前缀还原成 /api/*，交给 Express 应用处理。
//
// 为便于排查部署期错误：模块加载期与请求期的异常都被捕获，
// 以 JSON 返回真实错误信息（而不是 Vercel 的通用 500 文本 "A server e..."），
// 同时 console.error 写入 Vercel 函数日志。

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
    // 归一化子路径前缀：/eva/api/meta -> /api/meta
    if (req.url && req.url.startsWith('/eva')) {
      req.url = req.url.slice(4) || '/';
    }
    return app(req, res);
  } catch (e) {
    console.error('[api/index.js] 请求处理异常:', e && e.stack ? e.stack : e);
    if (!res.headersSent) {
      res.status(500).json({ error: '请求处理异常', detail: e && e.message });
    }
  }
};
