'use strict';

// Vercel 无服务器函数入口。
// Vercel 会把 api/ 下的文件编译为 Serverless Function：本文件对外暴露为 /api 路由。
// 由于前端部署在 /eva 子路径（base=/eva/），浏览器请求形如 /eva/api/meta，
// vercel.json 的 routes 把 /eva/api/* 转发到本函数，并保留原始 req.url=/eva/api/meta。
// 这里把 /eva 前缀剥掉还原成 /api/meta，交给 Express app 内部路由处理。

const app = require('../server/app');

module.exports = (req, res) => {
  // 剥离网关/子路径前缀 /eva，使 Express 内部 /api/* 路由能正确匹配。
  if (req.url && req.url.startsWith('/eva')) {
    req.url = req.url.slice(4) || '/';
  }
  return app(req, res);
};
