-- 内网部署：IBM DB2
-- 在 DB2 命令行或控制中心执行本文件。请将 EVAL 替换为实际 schema。
-- DB2 表名/列名默认大写；适配层已按大写读取。

CREATE TABLE EVAL.EVA_DEPARTMENTS (
  ID   VARCHAR(32) NOT NULL,
  NAME VARCHAR(128) NOT NULL,
  LVL  INTEGER,               -- 机构层级
  PRIMARY KEY (ID)
);

CREATE TABLE EVAL.EVA_SCORES (
  ID              BIGINT NOT NULL GENERATED ALWAYS AS IDENTITY, -- 主键
  DEPARTMENT_ID   VARCHAR(32) NOT NULL,--部门编号
  DEPARTMENT_NAME VARCHAR(128),        -- 冗余：机构名称
  QUARTER         VARCHAR(16) NOT NULL,--季度
  LEADERSHIP      INTEGER,     -- 领导能力
  ANALYSIS        INTEGER,     -- 分析决策
  EXECUTION       INTEGER,     -- 执行控制
  COORDINATION    INTEGER,     -- 组织协调
  ADVISORY        INTEGER,     -- 参谋作用
  USER_NAME       VARCHAR(64),  -- 冗余：评价人姓名（企微获取）
  USER_ID         VARCHAR(32),  -- 冗余：柜员号（企微通讯录自定义字段）
  EVALUATED_AT    TIMESTAMP DEFAULT CURRENT TIMESTAMP,
  PRIMARY KEY (ID)
);

-- 评价人清单（柜员号/姓名/岗位/所在机构/人员层级）
CREATE TABLE EVAL.EVA_USERS (
  USER_ID         VARCHAR(32) NOT NULL, -- 柜员号
  USER_NAME       VARCHAR(64),          -- 姓名
  JOB_NAME        VARCHAR(128),         -- 岗位
  DEPARTMENT_ID   VARCHAR(32),          -- 机构号
  DEPARTMENT_NAME VARCHAR(128),         -- 所在机构
  LVL             INTEGER,              -- 人员层级
  PRIMARY KEY (USER_ID)
);

-- 示例部门数据（可按实际情况替换/删除）。lvl 机构层级，按评价人层级过滤可见机构。
INSERT INTO EVAL.EVA_DEPARTMENTS (ID, NAME, LVL) VALUES
  ('D01', '综合管理部', 1),
  ('D02', '财务运营部', 1),
  ('D03', '风险管理部', 2),
  ('D04', '信息科技部', 2),
  ('D05', '客户服务中心', 3),
  ('D06', '人力资源部', 3);

-- 示例评价人数据（可按实际情况替换/删除）。lvl 人员层级，需与评价机构 lvl 对应。
INSERT INTO EVAL.EVA_USERS (USER_ID, USER_NAME, JOB_NAME, DEPARTMENT_ID, DEPARTMENT_NAME, LVL) VALUES
  ('80519443', '张三', '总经理',   'D01', '综合管理部', 1),
  ('80519444', '李四', '部门经理', 'D03', '风险管理部', 2),
  ('80519445', '王五', '业务专员', 'D05', '客户服务中心', 3);
