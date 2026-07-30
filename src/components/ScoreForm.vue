<template>
  <div class="score-form">
    <div
      v-for="(ab, idx) in abilities"
      :key="ab"
      :ref="el => setRowRef(el, ab)"
      class="ability-row"
      :class="{ 'row-miss': missingAbilities.includes(ab) }"
    >
      <div class="ability-name">{{ idx + 1 }}. {{ ab }}</div>
      <div class="options">
        <label
          v-for="opt in scoreOptions"
          :key="opt"
          class="opt"
          :class="{ 'opt-active': model[ABILITY_KEYS[ab]] === opt }"
        >
          <input
            type="radio"
            :name="abilityKey(ab)"
            :value="opt"
            :checked="model[ABILITY_KEYS[ab]] === opt"
            @change="onSelect(ab, opt)"
          />
          <span>{{ opt }}分</span>
        </label>
      </div>
    </div>
  </div>
</template>

<script>
import { ABILITY_KEYS } from '../abilities.js';

export default {
  name: 'ScoreForm',
  props: {
    abilities: { type: Array, required: true },
    scoreOptions: { type: Array, required: true },
    model: { type: Object, required: true },        // 当前部门评分对象
    missingAbilities: { type: Array, default: () => [] } // 高亮未选能力
  },
  emits: ['update:model'],
  data() {
    return { rowRefs: {} };
  },
  methods: {
    ABILITY_KEYS,
    abilityKey(ab) {
      return ABILITY_KEYS[ab] + '-' + this._uid;
    },
    setRowRef(el, ab) {
      if (el) this.rowRefs[ab] = el;
    },
    onSelect(ab, opt) {
      const key = ABILITY_KEYS[ab];
      const next = { ...this.model, [key]: opt };
      this.$emit('update:model', next);
    }
  }
};
</script>

<style scoped>
.score-form { display: flex; flex-direction: column; gap: 14px; }
.ability-row {
  border: 1px solid #d3d1c7;
  border-radius: 12px;
  padding: 14px 16px;
  background: #fff;
  transition: border-color .2s, box-shadow .2s;
}
.ability-row.row-miss {
  border-color: #E24B4A;
  box-shadow: 0 0 0 2px rgba(226,75,74,.18);
}
.ability-name { font-size: 14px; font-weight: 500; margin-bottom: 10px; color: #2c2c2a; }
.options { display: flex; flex-wrap: wrap; gap: 10px; }
.opt {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border: 1px solid #d3d1c7; border-radius: 8px;
  cursor: pointer; font-size: 13px; color: #444441; user-select: none;
  background: #f1efe8;
}
.opt input { display: none; }
.opt.opt-active { background: #E6F1FB; border-color: #185FA5; color: #0c447c; font-weight: 500; }
</style>
