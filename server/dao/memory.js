'use strict';

// 内存适配层：无需任何数据库即可运行，用于本地演示、冒烟测试，
// 以及部署尚未配置 Supabase/DB2 时的兜底。数据保存在进程内存中。
//
// 统一接口契约（所有 DAO 实现都必须提供）：
//   getDepartments(lvl?)          -> Promise<[{id, name, lvl}]>  可选按机构层级过滤
//   getDepartment(id)             -> Promise<{id, name, lvl}|null>
//   getEvaUsers()                 -> Promise<[{user_id,user_name,job_name,department_id,department_name,lvl}]>
//   getEvaUserByTellerNo(no)      -> Promise<row|null>
//   getScore(departmentId)        -> Promise<scoreRecord|null>
//   upsertScore(scoreRecord)      -> Promise<scoreRecord>  （写入冗余字段 department_name/user_name/user_id）
//   getSummary()                  -> Promise<[{department_id, department_name, ...abilities, total, user_name, user_id}]>

const DEFAULT_DEPARTMENTS = [
  { id: 'D01', name: '综合管理部', lvl: 1 },
  { id: 'D02', name: '财务运营部', lvl: 1 },
  { id: 'D03', name: '风险管理部', lvl: 2 },
  { id: 'D04', name: '信息科技部', lvl: 2 },
  { id: 'D05', name: '客户服务中心', lvl: 3 },
  { id: 'D06', name: '人力资源部', lvl: 3 }
];

const DEFAULT_USERS = [
  { user_id: '80519443', user_name: '张三', job_name: '总经理',   department_id: 'D01', department_name: '综合管理部', lvl: 1 },
  { user_id: '80519444', user_name: '李四', job_name: '部门经理', department_id: 'D03', department_name: '风险管理部', lvl: 2 },
  { user_id: '80519445', user_name: '王五', job_name: '业务专员', department_id: 'D05', department_name: '客户服务中心', lvl: 3 }
];

function createMemoryDao(departments, users) {
  const depts = (departments && departments.length) ? departments : DEFAULT_DEPARTMENTS;
  const evaUsers = (users && users.length) ? users : DEFAULT_USERS;
  const scores = new Map(); // departmentId -> record

  function scoreFromRow(rec) {
    if (!rec) return null;
    return { ...rec };
  }

  return {
    async getDepartments(lvl) {
      let list = depts;
      if (typeof lvl === 'number') list = list.filter(d => d.lvl === lvl);
      return list.map(d => ({ id: d.id, name: d.name, lvl: d.lvl }));
    },
    async getDepartment(id) {
      const d = depts.find(x => x.id === id);
      return d ? { id: d.id, name: d.name, lvl: d.lvl } : null;
    },
    async getEvaUsers() {
      return evaUsers.map(u => ({ ...u }));
    },
    async getEvaUserByTellerNo(tellerNo) {
      const u = evaUsers.find(x => x.user_id === tellerNo);
      return u ? { ...u } : null;
    },
    async getScore(departmentId) {
      return scoreFromRow(scores.get(departmentId) || null);
    },
    async upsertScore(record) {
      const dept = depts.find(x => x.id === record.department_id);
      const row = {
        department_id: record.department_id,
        department_name: dept ? dept.name : null,
        quarter: record.quarter,
        leadership: record.leadership ?? null,
        analysis: record.analysis ?? null,
        execution: record.execution ?? null,
        coordination: record.coordination ?? null,
        advisory: record.advisory ?? null,
        user_name: record.user_name ?? null,
        user_id: record.user_id ?? null,
        evaluated_at: new Date().toISOString()
      };
      scores.set(record.department_id, row);
      return scoreFromRow(row);
    },
    async getSummary() {
      const result = [];
      for (const d of depts) {
        const s = scores.get(d.id);
        if (!s) continue;
        const vals = [s.leadership, s.analysis, s.execution, s.coordination, s.advisory]
          .filter(v => typeof v === 'number');
        result.push({
          department_id: d.id,
          department_name: s.department_name || d.name,
          leadership: s.leadership,
          analysis: s.analysis,
          execution: s.execution,
          coordination: s.coordination,
          advisory: s.advisory,
          total: vals.reduce((a, b) => a + b, 0),
          user_name: s.user_name,
          user_id: s.user_id,
          evaluated_at: s.evaluated_at
        });
      }
      return result;
    }
  };
}

module.exports = { createMemoryDao };
