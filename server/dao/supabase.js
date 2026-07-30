'use strict';

// Supabase 适配层（外网部署）：使用 @supabase/supabase-js 读写 PostgreSQL。
// 表结构见 sql/supabase_schema.sql。
//
// 统一接口契约与 memory.js 一致（含 lvl 过滤与冗余字段）：
//   getDepartments(lvl?) / getDepartment(id) / getEvaUsers() /
//   getEvaUserByTellerNo(no) / getScore() / upsertScore() / getSummary()
const { createClient } = require('@supabase/supabase-js');

function createSupabaseDao(cfg, quarter) {
  const supa = cfg.supabase || {};

  // 延迟创建客户端：避免在缺少环境变量时于启动时直接崩溃。
  // 仅当真正访问数据库时才校验凭据，并返回清晰的错误信息。
  let client = null;
  function getClient() {
    if (client) return client;
    const supabaseKey = supa.serviceRoleKey || supa.anonKey;
    if (!supa.url || !supabaseKey) {
      throw new Error('Supabase 配置缺失：需在环境变量中设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY（config.json 不保存密钥）');
    }
    client = createClient(supa.url, supabaseKey);
    return client;
  }

  // 部门表：可选按机构层级 lvl 过滤（评价人只评同层级机构）。
  async function getDepartments(lvl) {
    let q = getClient().from('eva_departments')
      .select('department_id, department_name, lvl')
      .order('department_id', { ascending: true });
    if (typeof lvl === 'number') q = q.eq('lvl', lvl);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(d => ({ id: d.department_id, name: d.department_name, lvl: d.lvl }));
  }

  async function getDepartment(id) {
    const { data, error } = await getClient()
      .from('eva_departments')
      .select('department_id, department_name, lvl')
      .eq('department_id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.department_id, name: data.department_name, lvl: data.lvl } : null;
  }

  async function getEvaUsers() {
    const { data, error } = await getClient()
      .from('eva_users')
      .select('user_id, user_name, job_name, department_id, department_name, lvl')
      .order('lvl', { ascending: true })
      .order('user_id', { ascending: true });
    if (error) throw error;
    return (data || []).map(u => ({
      user_id: u.user_id, user_name: u.user_name, job_name: u.job_name,
      department_id: u.department_id, department_name: u.department_name, lvl: u.lvl
    }));
  }

  async function getEvaUserByTellerNo(tellerNo) {
    if (!tellerNo) return null;
    const { data, error } = await getClient()
      .from('eva_users')
      .select('user_id, user_name, job_name, department_id, department_name, lvl')
      .eq('user_id', tellerNo)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function getScore(departmentId) {
    const { data, error } = await getClient()
      .from('eva_scores')
      .select('*')
      .eq('department_id', departmentId)
      .eq('quarter', quarter)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function upsertScore(record) {
    // 冗余字段 department_name 由机构表查询后写入，避免 JOIN。
    const dept = await getDepartment(record.department_id);
    const payload = {
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
    const { data, error } = await getClient()
      .from('eva_scores')
      .upsert(payload, { onConflict: 'department_id,quarter' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function getSummary() {
    const { data: depts } = await getClient().from('eva_departments').select('department_id, department_name');
    const { data: scores, error } = await getClient()
      .from('eva_scores')
      .select('*')
      .eq('quarter', quarter);
    if (error) throw error;
    const deptMap = new Map((depts || []).map(d => [d.department_id, d.department_name]));
    const result = [];
    for (const s of (scores || [])) {
      const vals = [s.leadership, s.analysis, s.execution, s.coordination, s.advisory]
        .filter(v => typeof v === 'number');
      result.push({
        department_id: s.department_id,
        department_name: s.department_name || deptMap.get(s.department_id) || s.department_id,
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

  return { getDepartments, getDepartment, getEvaUsers, getEvaUserByTellerNo, getScore, upsertScore, getSummary };
}

module.exports = { createSupabaseDao };
