<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchCaseDetail } from '@/api/cases'
import { isKeyStep, keySteps, profileTags } from '@/utils/cases'

/**
 * 案例详情页（10/04 任务）。
 *
 * 交付标准是「展示时间线、关键节点、经验教训 —— 能看到完整步骤」，
 * 所以这一页的重点是三件事：
 *
 *   1. 【完整】时间线要一步一步全展示出来，不折叠、不截断。
 *      用户点进来就是想知道"他到底做了哪些事"，少给一步就失去了意义。
 *
 *   2. 【关键节点】要真的跳出来。
 *      报名、考试、换校这些时间点错过就只能等明年，是整个时间线里最值钱的
 *      信息。所以不只加个小标签，而是：带底色的卡片 + 变色的圆点 + 「关键节点」
 *      角标，三重强调。自检脚本会真的去比"关键节点和普通节点的圆点颜色是不是
 *      不一样"，不靠肉眼判断。
 *
 *   3. 【经验教训】单独成块放在最上面。
 *      这是走过这条路的人最想告诉后来者的话，比步骤本身更难得。
 *
 * 数据来源：GET /api/cases/<id>（接口文档 3.5 节），
 * 接口没通时回落到 utils/cases.js 的离线案例库（与 init.sql 一字不差）。
 */

const route = useRoute()

const loading = ref(true)
const notFound = ref(false)
const detail = ref(null)

/**
 * 时间线。后端已经按 order_no 升序返回了，这里再排一次是防御性的：
 * 万一哪天后端改了默认排序，页面上的顺序就会错乱 —— 而"顺序错了"这件事
 * 在时间线上很难被一眼发现，代价却很大。多排一次，几行代码的事。
 */
const steps = computed(() => {
  const list = (detail.value && detail.value.steps) || []
  return list.slice().sort((a, b) => (a.order_no || 0) - (b.order_no || 0))
})

/** 关键节点有几个 —— 顶部要让用户先知道"这段路里有几个不能错过的点" */
const keyCount = computed(() => keySteps(steps.value).length)

/**
 * 返回列表时带上这条案例的方向，这样回去还是筛好的状态。
 * 用户可能是从「全部」浏览进来的，那也没关系 —— 只是多筛了一个方向，
 * 他随时可以点回「全部」。
 */
const backLink = computed(() => {
  const d = detail.value && detail.value.direction
  return d ? { name: 'cases', query: { direction: d } } : { name: 'cases' }
})

onMounted(async () => {
  try {
    const data = await fetchCaseDetail(route.params.id)
    if (data) detail.value = data
    else notFound.value = true
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <RouterLink :to="backLink" class="back">← 返回案例列表</RouterLink>

    <div v-if="loading" class="card muted">正在加载案例…</div>

    <!-- 案例不存在（地址里 id 写错了，或者这条案例被删了） -->
    <div v-else-if="notFound" class="card">
      <h2 class="card__title">没有找到这条案例</h2>
      <p class="card__hint">
        可能是链接复制错了，或者这条案例已经被移除。回列表看看其他的吧。
      </p>
      <RouterLink to="/cases" class="btn">看看全部案例</RouterLink>
    </div>

    <template v-else-if="detail">
      <!-- ---------- 头部：这个人是谁 ---------- -->
      <header class="head">
        <div class="head__top">
          <span class="chip chip--direction">{{ detail.direction }}</span>
          <h1 class="head__title">{{ detail.title }}</h1>
        </div>

        <p class="head__summary">{{ detail.summary }}</p>

        <!-- 人物画像：这几个标签回答"这人跟我像不像" -->
        <ul class="profile">
          <li v-for="tag in profileTags(detail)" :key="tag" class="chip">
            {{ tag }}
          </li>
        </ul>

        <p v-if="detail.result" class="result">
          <span class="result__label">结果</span>
          {{ detail.result }}
        </p>
      </header>

      <!-- ---------- 经验教训 ----------
           放在步骤前面：想快速了解这条路的人，先看这段收获最大 -->
      <section v-if="detail.experience" class="card card--lesson">
        <h2 class="card__title">经验教训</h2>
        <p class="card__hint">走过这条路的人，最想告诉后来者的话</p>
        <p class="lesson">{{ detail.experience }}</p>
      </section>

      <!-- ---------- 时间线 ---------- -->
      <h2 class="section__title">
        完整路线
        <span v-if="steps.length" class="section__count">
          共 {{ steps.length }} 步<template v-if="keyCount">，其中 {{ keyCount }} 个关键节点</template>
        </span>
      </h2>

      <p v-if="!steps.length" class="card muted">这条案例还没有补充具体步骤。</p>

      <ol v-else class="timeline">
        <!--
          关键节点（is_key=1）会多一个 step--key 类。
          判断交给 utils 里的 isKeyStep()：数据库里的 1 可能是数字、字符串
          或布尔值，转换的脏活集中在那边做，页面上只关心"是/否"。
        -->
        <li
          v-for="(step, i) in steps"
          :key="i"
          class="step"
          :class="{ 'step--key': isKeyStep(step) }"
        >
          <span class="step__dot" aria-hidden="true"></span>

          <div class="step__body">
            <div class="step__head">
              <span class="step__phase">{{ step.phase }}</span>
              <span v-if="isKeyStep(step)" class="step__key">关键节点</span>
              <span class="step__no">第 {{ i + 1 }} 步</span>
            </div>
            <p class="step__content">{{ step.content }}</p>
          </div>
        </li>
      </ol>

      <!-- 接口没通时说明一下，免得以为看到的是数据库里的真实数据 -->
      <p v-if="!detail.synced" class="source-note">
        案例接口还没上线，当前展示的是内置案例库（内容与数据库一致）
      </p>
    </template>
  </div>
</template>

<style scoped>
/* ---------------- 返回 ---------------- */

.back {
  display: inline-block;
  margin-bottom: 18px;
  font-size: 13px;
  color: var(--text-2);
}

.back:hover {
  color: var(--primary);
}

/* ---------------- 头部 ---------------- */

.head {
  margin-bottom: 20px;
}

.head__top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.head__title {
  font-size: 21px;
  line-height: 1.4;
  margin: 0;
}

.head__summary {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-2);
}

.chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
}

.chip--direction {
  background: var(--primary-weak);
  border-color: #d3e0ff;
  color: var(--primary);
  font-weight: 500;
}

.profile {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
}

.result {
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--success-weak);
  border: 1px solid #c4e8da;
  font-size: 13px;
  line-height: 1.7;
  color: #0f6b4f;
}

.result__label {
  display: inline-block;
  margin-right: 8px;
  font-weight: 500;
}

/* ---------------- 经验教训 ---------------- */

.card--lesson {
  border-color: #d5e0f7;
  background: linear-gradient(180deg, #f7faff 0%, var(--surface) 60%);
}

/* 数据库里的经验是分段存的（一段一行），
   不加 pre-line 的话几段会挤成一坨，读起来很累 */
.lesson {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--text);
  white-space: pre-line;
}

/* ---------------- 时间线 ---------------- */

.section__title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  margin: 28px 0 16px;
  font-size: 16px;
  font-weight: 500;
}

/* 「共 8 步，其中 4 个关键节点」跟在标题后面，字号小一点不抢标题 */
.section__count {
  font-size: 12.5px;
  font-weight: 400;
  color: var(--text-3);
}

.timeline {
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  --key: #d98817;
  --key-weak: #fdf4e4;

  position: relative;
  padding: 0 0 16px 30px;
}

/* 连接两个节点的竖线。最后一步不画，否则下面会多出一小截 */
.step::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 20px;
  bottom: 0;
  width: 2px;
  background: var(--border);
}

.step:last-child::before {
  display: none;
}

.step__dot {
  position: absolute;
  left: 0;
  top: 7px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface);
  border: 3px solid var(--border-strong);
}

.step__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.step__phase {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
}

/* 「第 N 步」推到右边，让左侧的阅读动线干净 */
.step__no {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-3);
}

.step__content {
  margin: 8px 0 0;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text);
}

/* ---------- 关键节点：三重强调，让它一眼跳出来 ---------- */

/* ① 整块加深色底，在一条灰白的竖线里像个"路标" */
.step--key .step__body {
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--key-weak);
  border: 1px solid #f2e0be;
}

/* ② 圆点改成实心橙色 + 一圈光晕 */
.step--key .step__dot {
  top: 19px;
  background: var(--key);
  border-color: var(--key);
  box-shadow: 0 0 0 4px rgba(217, 136, 23, 0.16);
}

/* ③ 阶段标签和「关键节点」角标也换成橙色系 */
.step--key .step__phase {
  background: #fff;
  border-color: #f2e0be;
  color: #a8650c;
  font-weight: 500;
}

.step__key {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--key);
  color: #fff;
  font-size: 11px;
  font-weight: 500;
}

.step--key .step__content {
  color: #6b4708;
  font-weight: 500;
}

.step--key .step__no {
  color: #b98a4a;
}

/* ---------------- 其它 ---------------- */

.source-note {
  margin: 18px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 560px) {
  .head__title {
    font-size: 18px;
  }

  .step {
    padding-left: 24px;
  }
}
</style>
