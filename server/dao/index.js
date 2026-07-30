'use strict';

// DAO 工厂：根据 config.deploy 选择具体数据库实现。
//   memory   -> 内存（演示/兜底，零依赖）
//   supabase -> 外网 PostgreSQL（见 dao/supabase.js）
//   db2      -> 内网 DB2（见 dao/db2.js）
// 切换只改 config.json 的 deploy 字段，业务代码无感知。

const { createMemoryDao } = require('./memory');
const { createSupabaseDao } = require('./supabase');
const { createDb2Dao } = require('./db2');

function createDao(cfg) {
  const deploy = (cfg.deploy || 'memory').toLowerCase();
  switch (deploy) {
    case 'supabase':
      return createSupabaseDao(cfg, cfg.quarter);
    case 'db2':
      return createDb2Dao(cfg, cfg.quarter);
    case 'memory':
    default:
      return createMemoryDao(cfg.departments, cfg.evaUsers);
  }
}

module.exports = { createDao };
