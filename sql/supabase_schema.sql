-- 外网部署：Supabase (PostgreSQL)
-- 在 Supabase SQL Editor 中执行本文件。表名小写，符合 Postgres 习惯。

-- 部门表：评价对象
create table if not exists public.eva_departments (
  department_id   text primary key,
  department_name text not null,
  lvl int --机构层级
);
--评价人清单
create table if not exists public.eva_users (
  user_id text primary key, --柜员号
  user_name text,--姓名
  job_name text,--岗位
  department_id   text,--机构号
  department_name text,--所在机构
  lvl int --人员层级
);

-- 评分表：每部门每季度一条记录，5 项能力 + 评价人身份
create table if not exists public.eva_scores (
  id              bigint generated always as identity primary key,
  department_id   text not null,
  department_name text,
  quarter         text not null,
  leadership      integer,  -- 领导能力
  analysis        integer,  -- 分析决策
  execution       integer,  -- 执行控制
  coordination    integer,  -- 组织协调
  advisory        integer,  -- 参谋作用
  user_name  text,     -- 评价人姓名（企微获取）
  user_id    text,     -- 柜员号（企微通讯录自定义字段）
  evaluated_at    timestamptz default now()
);

-- 行级安全（按需在 Supabase 后台开启，演示时可先关闭）
-- alter table public.eva_departments enable row level security;
-- alter table public.eva_scores enable row level security;

-- 示例部门数据（可按实际情况替换/删除）。lvl 为机构层级，用于按评价人层级过滤可见机构。
insert into public.eva_departments (department_id, department_name, lvl) values
  ('D01', '综合管理部', 1),
  ('D02', '财务运营部', 1),
  ('D03', '风险管理部', 2),
  ('D04', '信息科技部', 2),
  ('D05', '客户服务中心', 3),
  ('D06', '人力资源部', 3)
on conflict (department_id) do nothing;

-- 示例评价人数据（可按实际情况替换/删除）。lvl 为人员层级，需与评价机构 lvl 对应。
insert into public.eva_users (user_id, user_name, job_name, department_id, department_name, lvl) values
  ('80519443', '张三', '总经理',     'D01', '综合管理部', 1),
  ('80519444', '李四', '部门经理',   'D03', '风险管理部', 2),
  ('80519445', '王五', '业务专员',   'D05', '客户服务中心', 3)
on conflict (user_id) do nothing;
