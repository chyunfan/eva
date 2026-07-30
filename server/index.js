'use strict';

// 本地 / 自托管运行入口：导入 Express app 并在端口上常驻监听。
// 在 Vercel 等无服务器平台，不会执行本文件（由 api/index.js 复用 server/app.js）。

const app = require('./app');
const { loadConfig } = require('./config');

const cfg = loadConfig();
const port = (cfg.server && cfg.server.port) || 3000;

// 仅在直接运行本文件时监听端口（被 require 时不监听，便于复用）。
if (require.main === module) {
  app.listen(port, () => {
    console.log(`部门季度评价系统已启动: http://localhost:${port}`);
    console.log(`当前部署模式 deploy=${cfg.deploy}, 企业微信 enabled=${!!cfg.wecom.enabled}`);
  });
}

module.exports = app;
