'use strict';

// DB2 适配层（内网部署）：通过 ibm_db (Node.js ODBC/CLI 驱动) 连接 DB2。
// 表结构见 sql/db2_schema.sql。连接参数来自 config.json -> db2，可修改。
//
// 注意：
//   - 内网环境需提前安装 DB2 客户端 / ODBC 驱动，ibm_db 会在首次 require 时下载预编译二进制。
//   - 连接字符串使用可改配置项，不应把密码硬编码进代码。
//
// 统一接口契约与 memory.js 一致（含 lvl 过滤与冗余字段）。

// ibm_db 依赖原生编译，可能未安装；按需 lazy require，避免在未配置 DB2 时阻断启动。
let ibmdb;
function getIbmDb() {
  if (!ibmdb) {
    // eslint-disable-next-line global-require
    ibmdb = require('ibm_db');
  }
  return ibmdb;
}

function buildConnString(db2) {
  // DB2 标准 ODBC 连接串
  return `DRIVER={IBM DB2 ODBC DRIVER};`
    + `DATABASE=${db2.database};`
    + `HOSTNAME=${db2.host};`
    + `PORT=${db2.port};`
    + `PROTOCOL=TCPIP;`
    + `UID=${db2.username};`
    + `PWD=${db2.password};`
    + (db2.schema ? `CURRENTSCHEMA=${db2.schema};` : '');
}

function createDb2Dao(cfg, quarter) {
  const connStr = buildConnString(cfg.db2);
  const schema = cfg.db2.schema ? `${cfg.db2.schema}.` : '';

  async function open() {
    const db = getIbmDb();
    return new Promise((resolve, reject) => {
      db.open(connStr, (err, conn) => {
        if (err) return reject(err);
        resolve(conn);
      });
    });
  }

  async function run(sql, params, fetch) {
    const conn = await open();
    try {
      if (fetch) {
        return await new Promise((resolve, reject) => {
          conn.query(sql, params || [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          });
        });
      }
      await new Promise((resolve, reject) => {
        conn.prepare(sql, (err, stmt) => {
          if (err) return reject(err);
          stmt.executeNonQuery(params || [], (e) => {
            if (e) return reject(e);
            resolve();
          });
        });
      });
    } finally {
      try { conn.closeSync(); } catch (_) { /* ignore */ }
    }
  }

  async function getDepartments(lvl) {
    let sql = `SELECT ID, NAME, LVL FROM ${schema}EVA_DEPARTMENTS`;
    if (typeof lvl === 'number') sql += ` WHERE LVL = ${Number(lvl)}`;
    sql += ` ORDER BY ID ASC`;
    const rows = await run(sql, [], true);
    return (rows || []).map(r => ({ id: r.ID, name: r.NAME, lvl: r.LVL }));
  }

  async function getDepartment(id) {
    const rows = await run(
      `SELECT ID, NAME, LVL FROM ${schema}EVA_DEPARTMENTS WHERE ID = ?`,
      [id], true
    );
    const r = (rows && rows[0]) || null;
    return r ? { id: r.ID, name: r.NAME, lvl: r.LVL } : null;
  }

  async function getEvaUsers() {
    const rows = await run(
      `SELECT USER_ID, USER_NAME, JOB_NAME, DEPARTMENT_ID, DEPARTMENT_NAME, LVL `
      + `FROM ${schema}EVA_USERS ORDER BY LVL ASC, USER_ID ASC`,
      [], true
    );
    return (rows || []).map(u => ({
      user_id: u.USER_ID, user_name: u.USER_NAME, job_name: u.JOB_NAME,
      department_id: u.DEPARTMENT_ID, department_name: u.DEPARTMENT_NAME, lvl: u.LVL
    }));
  }

  async function getEvaUserByTellerNo(tellerNo) {
    if (!tellerNo) return null;
    const rows = await run(
      `SELECT USER_ID, USER_NAME, JOB_NAME, DEPARTMENT_ID, DEPARTMENT_NAME, LVL `
      + `FROM ${schema}EVA_USERS WHERE USER_ID = ?`,
      [tellerNo], true
    );
    const u = (rows && rows[0]) || null;
    return u ? {
      user_id: u.USER_ID, user_name: u.USER_NAME, job_name: u.JOB_NAME,
      department_id: u.DEPARTMENT_ID, department_name: u.DEPARTMENT_NAME, lvl: u.LVL
    } : null;
  }

  async function getScore(departmentId) {
    const rows = await run(
      `SELECT * FROM ${schema}EVA_SCORES WHERE DEPARTMENT_ID = ? AND QUARTER = ?`,
      [departmentId, quarter], true
    );
    return (rows && rows[0]) ? rows[0] : null;
  }

  async function upsertScore(record) {
    const dept = await getDepartment(record.department_id);
    const departmentName = dept ? dept.name : null;
    const existing = await getScore(record.department_id);
    const evaluatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (existing) {
      await run(
        `UPDATE ${schema}EVA_SCORES SET leadership=?, analysis=?, execution=?, coordination=?, advisory=?, `
        + `department_name=?, user_name=?, user_id=?, evaluated_at=? WHERE department_id=? AND quarter=?`,
        [record.leadership ?? null, record.analysis ?? null, record.execution ?? null,
         record.coordination ?? null, record.advisory ?? null, departmentName,
         record.user_name ?? null, record.user_id ?? null, evaluatedAt,
         record.department_id, quarter]
      );
    } else {
      await run(
      `INSERT INTO ${schema}EVA_SCORES `
      + `(department_id, department_name, quarter, leadership, analysis, execution, coordination, advisory, user_name, user_id, evaluated_at) `
        + `VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [record.department_id, departmentName, quarter, record.leadership ?? null, record.analysis ?? null,
         record.execution ?? null, record.coordination ?? null, record.advisory ?? null,
         record.user_name ?? null, record.user_id ?? null, evaluatedAt]
      );
    }
    return getScore(record.department_id);
  }

  async function getSummary() {
    const depts = await run(`SELECT ID, NAME FROM ${schema}EVA_DEPARTMENTS`, [], true);
    const scores = await run(`SELECT * FROM ${schema}EVA_SCORES WHERE QUARTER = ?`, [quarter], true);
    const deptMap = new Map((depts || []).map(d => [d.ID, d.NAME]));
    const result = [];
    for (const s of (scores || [])) {
      const vals = [s.LEADERSHIP, s.ANALYSIS, s.EXECUTION, s.COORDINATION, s.ADVISORY]
        .filter(v => typeof v === 'number');
      result.push({
        department_id: s.DEPARTMENT_ID,
        department_name: s.DEPARTMENT_NAME || deptMap.get(s.DEPARTMENT_ID) || s.DEPARTMENT_ID,
        leadership: s.LEADERSHIP,
        analysis: s.ANALYSIS,
        execution: s.EXECUTION,
        coordination: s.COORDINATION,
        advisory: s.ADVISORY,
        total: vals.reduce((a, b) => a + b, 0),
        user_name: s.USER_NAME,
        user_id: s.USER_ID,
        evaluated_at: s.EVALUATED_AT
      });
    }
    return result;
  }

  return { getDepartments, getDepartment, getEvaUsers, getEvaUserByTellerNo, getScore, upsertScore, getSummary };
}

module.exports = { createDb2Dao };
