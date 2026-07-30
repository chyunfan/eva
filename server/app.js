'use strict';

// Express 应用定义（无服务器友好版）。
// 本文件只负责「创建并配置 app」并导出，不调用 app.listen()，
// 因此既能在本地用 server/index.js 起常驻进程，也能被 Vercel 无服务器函数
// （api/index.js）直接复用，无需常驻端口。

const path = require('path');
const express = require('express');
const { loadConfig } = require('./config');
const { createDao } = require('./dao');
const wecom = require('./wecom');

const cfg = loadConfig();
const dao = createDao(cfg);

const ABILITY_KEYS = {
  '领导能力': 'leadership',
  '分析决策': 'analysis',
  '执行控制': 'execution',
  '组织协调': 'coordination',
  '参谋作用': 'advisory'
};

const app = express();
app.use(express.json());

// 暴露给前端的元信息（评分维度、分值选项、季度、是否启用企微）
app.get('/api/meta', (req, res) => {
  res.json({
    abilities: cfg.abilities,
    scoreOptions: cfg.scoreOptions,
    quarter: cfg.quarter,
    wecomEnabled: !!cfg.wecom.enabled
  });
});

// 企微授权入口：返回网页授权跳转地址（前端重定向到此地址）
app.get('/api/wecom/auth-url', (req, res) => {
  if (!cfg.wecom.enabled) return res.status(400).json({ error: '未启用企业微信' });
  res.json({ url: wecom.buildAuthUrl(cfg) });
});

// 企微回调：携带 code，解析出姓名与柜员号（可作为服务端直接回调使用）
app.get('/api/wecom/callback', async (req, res) => {
  try {
    if (!cfg.wecom.enabled) return res.status(400).json({ error: '未启用企业微信' });
    const code = req.query.code;
    if (!code) return res.status(400).json({ error: '缺少 code' });
    const info = await wecom.resolveEvaluator(cfg, code);
    res.json({ name: info.name, teller_no: info.teller_no });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 前端流程用：企微授权后浏览器带着 code 回到前端页面，前端再调用本接口换姓名/柜员号。
// redirectUri 在 config 中配置为前端地址（如 https://your-domain/ 或 http://localhost:5173/）。
app.get('/api/wecom/resolve', async (req, res) => {
  try {
    if (!cfg.wecom.enabled) return res.status(400).json({ error: '未启用企业微信' });
    const code = req.query.code;
    if (!code) return res.status(400).json({ error: '缺少 code' });
    const info = await wecom.resolveEvaluator(cfg, code);
    res.json({ name: info.name, teller_no: info.teller_no });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 评价人清单（非企微场景用于身份选择器；企微场景也可备查）
app.get('/api/evaluators', async (req, res) => {
  try {
    res.json(await dao.getEvaUsers());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 按柜员号查询单个评价人（企微解析出 teller_no 后取层级与姓名）
app.get('/api/evaluator', async (req, res) => {
  try {
    const t = req.query.teller_no;
    if (!t) return res.status(400).json({ error: '缺少 teller_no' });
    res.json(await dao.getEvaUserByTellerNo(t) || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 部门列表（可选 ?lvl=N 仅返回该机构层级的部门，实现"按评价人层级过滤可见机构"）
app.get('/api/departments', async (req, res) => {
  try {
    const lvl = req.query.lvl !== undefined && req.query.lvl !== '' ? Number(req.query.lvl) : undefined;
    res.json(await dao.getDepartments(lvl));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 单个部门已存评分（用于回显）
app.get('/api/scores/:departmentId', async (req, res) => {
  try {
    res.json(await dao.getScore(req.params.departmentId) || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 保存单个部门评分（前端已完成前端校验后调用）
app.post('/api/scores/:departmentId', async (req, res) => {
  try {
    const body = req.body || {};
    // 校验分值合法性
    const record = { department_id: req.params.departmentId, quarter: cfg.quarter };
    for (const ab of cfg.abilities) {
      const key = ABILITY_KEYS[ab];
      const v = body[key];
      if (typeof v === 'number') {
        if (!cfg.scoreOptions.includes(v)) return res.status(400).json({ error: `分值 ${v} 不在可选范围内` });
        record[key] = v;
      } else {
        record[key] = null;
      }
    }
    record.user_name = body.user_name || null;
    record.user_id = body.user_id || null;
    res.json(await dao.upsertScore(record));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 汇总（可选页面）
app.get('/api/summary', async (req, res) => {
  try {
    res.json(await dao.getSummary());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 静态托管已构建的前端（前端构建产物位于项目根目录的 dist/）。
// 注意：部署到 Vercel 时，静态文件由平台直接服务（见 vercel.json 的 outputDirectory），
// 该中间件仅在本地/自托管 Node 场景下生效。
const dist = path.join(__dirname, '..', 'dist');

// 安全：禁止通过 HTTP 访问敏感配置文件，确保 config.json / .env 等不被用户获取。
// 该中间件放在静态托管之前，任何对这些文件名的请求一律返回 404。
const BLOCKED_FILES = ['config.json', 'config.example.json', '.env', '.env.example'];
app.use((req, res, next) => {
  const name = req.path.split('/').pop().toLowerCase();
  if (BLOCKED_FILES.includes(name)) {
    return res.status(404).send('Not Found');
  }
  next();
});

app.use(express.static(dist));

module.exports = app;
