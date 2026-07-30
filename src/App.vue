<template>
  <div class="page">
    <header class="topbar">
      <div class="title">部门季度评价</div>
      <div class="sub">{{ quarter }}</div>
      <div v-if="evaluator.name" class="eval-info">
        评价人：{{ evaluator.name }}（柜员号 {{ evaluator.tellerNo || '—' }}<template v-if="evaluator.lvl != null"> · 层级 {{ evaluator.lvl }}</template>）
      </div>
    </header>

    <!-- 企微授权按钮（启用时显示） -->
    <div v-if="meta.wecomEnabled && !evaluator.name" class="wecom-bar">
      <button class="btn primary" @click="startWecomAuth">企业微信登录获取身份</button>
    </div>

    <!-- 非企微：身份选择器（按层级过滤机构前先确定身份） -->
    <section v-if="!meta.wecomEnabled && step === 'identity'" class="card">
      <h2 class="h2">请选择您的身份</h2>
      <div class="picker">
        <select v-model="selectedUid" @change="pickEvaluator" class="select">
          <option value="">-- 请选择评价人 --</option>
          <option v-for="u in evaluators" :key="u.user_id" :value="u.user_id">
            {{ u.user_name }}（{{ u.job_name }} · {{ u.department_name }} · 层级{{ u.lvl }}）
          </option>
        </select>
      </div>
      <p class="hint">系统将仅展示与您层级相同的机构供评价。</p>
    </section>

    <!-- 步骤 1：部门总览 -->
    <section v-if="step === 'list'" class="card">
      <h2 class="h2">请选择部门进行评价</h2>
      <div class="dept-grid">
        <button
          v-for="d in departments"
          :key="d.id"
          class="dept-card"
          @click="enterDept(d)"
        >
          <div class="dept-name">{{ d.name }}</div>
          <div class="dept-status" :class="scoreState(d.id).done ? 'done' : 'todo'">
            {{ scoreState(d.id).done ? '已评 ' + scoreState(d.id).total + '分' : '未评价' }}
          </div>
        </button>
      </div>
    </section>

    <!-- 步骤 2：单部门评分 -->
    <section v-else-if="step === 'score'" class="card">
      <div class="nav-head">
        <button class="btn ghost" @click="goList">← 部门列表</button>
        <div class="progress">第 {{ currentIndex + 1 }} / {{ departments.length }} 个 · {{ currentDept.name }}</div>
      </div>

      <div v-if="saveError" class="alert">{{ saveError }}</div>
      <div v-if="validateMsg" class="alert">{{ validateMsg }}</div>

      <ScoreForm
        :abilities="meta.abilities"
        :scoreOptions="meta.scoreOptions"
        :model="currentModel"
        :missingAbilities="missingAbilities"
        @update:model="onModelChange"
      />

      <div class="footer-actions">
        <button class="btn" @click="prevDept" :disabled="currentIndex === 0">← 上一部门</button>
        <button v-if="currentIndex < departments.length - 1" class="btn primary" @click="nextDept">
          下一部门 →
        </button>
        <button v-else class="btn primary" @click="finishAll">完成并提交</button>
      </div>
    </section>

    <!-- 步骤 3：汇总 -->
    <section v-else-if="step === 'summary'" class="card">
      <h2 class="h2">评价汇总</h2>
      <div v-if="evaluator.name" class="eval-info">评价人：{{ evaluator.name }}（柜员号 {{ evaluator.tellerNo || '—' }}）</div>
      <table class="summary-table">
        <thead>
          <tr>
            <th>部门</th>
            <th v-for="ab in meta.abilities" :key="ab">{{ ab }}</th>
            <th>合计</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in summary" :key="row.department_id">
            <td>{{ row.department_name }}</td>
            <td v-for="ab in meta.abilities" :key="ab">{{ fmt(row[ABILITY_KEYS[ab]]) }}</td>
            <td class="total">{{ row.total }}</td>
          </tr>
        </tbody>
      </table>
      <div class="footer-actions">
        <button class="btn" @click="step = 'list'">返回列表</button>
      </div>
    </section>
  </div>
</template>

<script>
import ScoreForm from './components/ScoreForm.vue';
import { ABILITY_KEYS } from './abilities.js';

// 挂载基路径：本地/根部署为 '/'；网关子路径部署用 VITE_BASE（如 /dept-eval/）。
// 统一拼接，保证走网关转发时 API 请求也带上前缀。
const API_BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const apiUrl = (p) => API_BASE + p;

const EMPTY_MODEL = () => ({
  leadership: null, analysis: null, execution: null, coordination: null, advisory: null
});

export default {
  name: 'App',
  components: { ScoreForm },
  data() {
    return {
      ABILITY_KEYS,
      meta: { abilities: ['领导能力', '分析决策', '执行控制', '组织协调', '参谋作用'],
              scoreOptions: [20, 19, 18, 17, 16, 15], quarter: '', wecomEnabled: false },
      departments: [],
      models: {},        // departmentId -> 评分对象
      evaluators: [],     // 非企微场景的身份清单
      selectedUid: '',    // 身份选择器当前选择
      evaluator: { name: '', tellerNo: '', lvl: null, jobName: '', departmentName: '' },
      step: 'identity',   // identity(选身份) -> list -> score -> summary
      currentIndex: 0,
      validateMsg: '',
      saveError: '',
      missingAbilities: [],
      summary: []
    };
  },
  computed: {
    currentDept() { return this.departments[this.currentIndex] || {}; },
    currentModel() { return this.models[this.currentDept.id] || EMPTY_MODEL(); }
  },
  methods: {
    fmt(v) { return (typeof v === 'number') ? v : '—'; },
    scoreState(id) {
      const m = this.models[id];
      if (!m) return { done: false, total: 0 };
      const vals = this.meta.abilities.map(ab => m[ABILITY_KEYS[ab]]).filter(v => typeof v === 'number');
      return { done: vals.length === this.meta.abilities.length, total: vals.reduce((a, b) => a + b, 0) };
    },
    async loadMeta() {
      const r = await fetch(apiUrl('/api/meta'));
      this.meta = await r.json();
    },
    async loadDepartments(lvl) {
      const url = apiUrl('/api/departments') + (typeof lvl === 'number' ? '?lvl=' + lvl : '');
      const r = await fetch(url);
      this.departments = await r.json();
    },
    async loadEvaluators() {
      try {
        const r = await fetch(apiUrl('/api/evaluators'));
        this.evaluators = await r.json();
      } catch (_) { this.evaluators = []; }
    },
    pickEvaluator() {
      const u = this.evaluators.find(x => x.user_id === this.selectedUid);
      if (!u) return;
      this.evaluator = {
        name: u.user_name, tellerNo: u.user_id, lvl: u.lvl,
        jobName: u.job_name, departmentName: u.department_name
      };
      this.loadDepartments(u.lvl).then(() => { this.step = 'list'; });
    },
    enterDept(d) {
      this.step = 'score';
      this.currentIndex = this.departments.findIndex(x => x.id === d.id);
      if (!this.models[d.id]) {
        this.models[d.id] = EMPTY_MODEL();
        // 尝试回显已存评分
        fetch(apiUrl('/api/scores/' + d.id)).then(r => r.json()).then(rec => {
          if (rec && (rec.leadership !== null || rec.leadership !== undefined)) {
            const m = EMPTY_MODEL();
            for (const ab of this.meta.abilities) m[ABILITY_KEYS[ab]] = rec[ABILITY_KEYS[ab]] ?? null;
            this.models[d.id] = m;
          }
        }).catch(() => {});
      }
    },
    onModelChange(next) {
      this.models[this.currentDept.id] = next;
      this.validateMsg = '';
      this.missingAbilities = [];
    },
    // 校验：按顺序检查 5 项是否都已选
    checkComplete() {
      const missing = this.meta.abilities.filter(ab => {
        const v = this.models[this.currentDept.id][ABILITY_KEYS[ab]];
        return typeof v !== 'number';
      });
      return missing;
    },
    async saveCurrent() {
      const id = this.currentDept.id;
      const m = this.models[id];
      const payload = { ...m, user_name: this.evaluator.name || null, user_id: this.evaluator.tellerNo || null };
      const r = await fetch(apiUrl('/api/scores/' + id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || '保存失败');
      }
      return r.json();
    },
    async nextDept() {
      const missing = this.checkComplete();
      if (missing.length) {
        this.missingAbilities = missing;
        this.validateMsg = '您还有未完成的打分';
        // 停留并定位第一个未选能力
        this.$nextTick(() => {
          const el = this.$el.querySelector('.ability-row.row-miss');
          if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        return;
      }
      this.validateMsg = '';
      this.missingAbilities = [];
      try { await this.saveCurrent(); }
      catch (e) { this.saveError = e.message; return; }
      this.saveError = '';
      if (this.currentIndex < this.departments.length - 1) {
        this.currentIndex += 1;
        this.step = 'score';
      }
    },
    prevDept() {
      // 上一部门不做强制校验，允许回看修改
      if (this.currentIndex > 0) this.currentIndex -= 1;
    },
    goList() { this.step = 'list'; },
    async finishAll() {
      const missing = this.checkComplete();
      if (missing.length) {
        this.missingAbilities = missing;
        this.validateMsg = '您还有未完成的打分';
        this.$nextTick(() => {
          const el = this.$el.querySelector('.ability-row.row-miss');
          if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        return;
      }
      try { await this.saveCurrent(); }
      catch (e) { this.saveError = e.message; return; }
      const r = await fetch(apiUrl('/api/summary'));
      this.summary = await r.json();
      this.step = 'summary';
    },
    async startWecomAuth() {
      const r = await fetch(apiUrl('/api/wecom/auth-url'));
      const data = await r.json();
      if (data.url) window.location.href = data.url;
    },
    async resolveWecom() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (!code) return; // 等待用户点击企微登录按钮
      const r = await fetch(apiUrl('/api/wecom/resolve?code=' + encodeURIComponent(code)));
      const data = await r.json();
      if (data.name) {
        this.evaluator = { name: data.name, tellerNo: data.teller_no || '', lvl: null, jobName: '', departmentName: '' };
        // 清理 URL 中的 code，避免刷新重复
        window.history.replaceState({}, '', window.location.pathname);
        // 用柜员号取评价人层级，按层级过滤可见机构
        if (data.teller_no) {
          try {
            const ur = await fetch(apiUrl('/api/evaluator?teller_no=' + encodeURIComponent(data.teller_no)));
            const u = await ur.json();
            if (u && u.user_id) {
              this.evaluator.lvl = u.lvl;
              this.evaluator.jobName = u.job_name;
              this.evaluator.departmentName = u.department_name;
              this.evaluator.name = u.user_name || this.evaluator.name;
            }
          } catch (_) { /* 取不到层级则展示全部机构 */ }
        }
        await this.loadDepartments(this.evaluator.lvl);
        this.step = 'list';
      }
    }
  },
  async mounted() {
    await this.loadMeta();
    if (this.meta.wecomEnabled) {
      await this.resolveWecom();
    } else {
      await this.loadEvaluators();
      this.step = 'identity';
    }
  }
};
</script>

<style scoped>
.page { max-width: 880px; margin: 0 auto; padding: 20px 16px 60px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #2c2c2a; }
.topbar { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; padding-bottom: 12px; border-bottom: 1px solid #d3d1c7; }
.title { font-size: 18px; font-weight: 600; }
.sub { color: #888780; font-size: 13px; }
.eval-info { margin-left: auto; font-size: 13px; color: #0c447c; }
.wecom-bar { margin: 16px 0; }
.picker { margin: 6px 0 10px; }
.select { width: 100%; max-width: 420px; padding: 10px 12px; border: 1px solid #5f5e5a; border-radius: 8px; font-size: 14px; background: #fff; color: #2c2c2a; }
.hint { font-size: 12px; color: #888780; margin: 8px 0 0; }
.card { margin-top: 18px; background: #fff; border: 1px solid #d3d1c7; border-radius: 16px; padding: 20px; }
.h2 { font-size: 15px; font-weight: 600; margin: 0 0 14px; }
.dept-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.dept-card { text-align: left; border: 1px solid #d3d1c7; border-radius: 12px; padding: 14px; background: #f1efe8; cursor: pointer; }
.dept-card:hover { border-color: #185FA5; }
.dept-name { font-size: 14px; font-weight: 500; margin-bottom: 8px; }
.dept-status { font-size: 12px; }
.dept-status.done { color: #0f6e56; }
.dept-status.todo { color: #888780; }
.nav-head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.progress { font-size: 13px; color: #444441; }
.alert { background: #FCEBEB; border: 1px solid #F09595; color: #A32D2D; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; font-size: 13px; }
.footer-actions { display: flex; justify-content: space-between; margin-top: 20px; gap: 12px; }
.btn { padding: 10px 18px; border: 1px solid #5f5e5a; border-radius: 8px; background: #fff; cursor: pointer; font-size: 13px; color: #2c2c2a; }
.btn.primary { background: #185FA5; border-color: #185FA5; color: #fff; }
.btn.ghost { background: #f1efe8; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.summary-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.summary-table th, .summary-table td { border: 1px solid #d3d1c7; padding: 8px 10px; text-align: center; }
.summary-table th { background: #f1efe8; font-weight: 500; }
.summary-table .total { font-weight: 600; color: #0c447c; }
</style>
