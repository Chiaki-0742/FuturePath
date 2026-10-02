<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import {
  GROUPS,
  MULTI_MAX,
  buildPayload,
  emptyAnswers,
  fieldKeyOf,
  groupQuestions,
  localUsername,
} from '@/utils/survey'
import { fetchAnswers, fetchQuestions, skipSurvey, submitAnswers } from '@/api/survey'

/**
 * 规划问卷（10/02 任务 1）。
 *
 * 交付标准：能填、能提交、能显示第几步。
 *
 * 题目来自后端 `GET /api/questions`（题库存在数据库的 questions 表里，共 9 题），
 * 按 group_name 分成三屏：
 *   第 1 屏 未来方向（A 组，1 题）
 *   第 2 屏 当前现状（B 组，6 题）
 *   第 3 屏 想了解什么（C 组，2 题）
 *
 * 后端接口还没上线时，会自动用 utils/survey.js 里的离线题库，
 * 页面照样能开、能填、能演示。
 *
 * ------------------------------------------------------------------
 * 三个设计上的说明：
 *
 * 1. 点"下一步"时【只校验当前这一屏】
 *    el-form 的 validateField 可以只校验指定字段。
 *    一上来就整表校验的话，后面两屏还没填，会瞬间飘出一片红字，
 *    用户会觉得"我什么都做错了"。
 *
 * 2. "最多选 3 个"和"都没有"互斥，是用 watch 修正的，不靠组件库的属性
 *    组件库虽然也支持 max，但自己写能保证：超了就回退并提示，
 *    选"都没有"就自动清掉其他项 —— 行为完全可控。
 *
 * 3. 留了一个"以后再说"的出口
 *    任务要求是"没填的用户先引导去问卷"，但如果只能填不能退，
 *    演示时会卡在问卷页出不去，看起来像页面坏了。
 *    跳过也记一笔，之后不再拦，随时能回来重填。
 * ------------------------------------------------------------------
 */

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const formRef = ref(null)
const questions = ref([])
const answers = reactive({})
const step = ref(0)
const loading = ref(true)
const submitting = ref(false)

// 三屏：每屏带自己的题目，题目上挂着对应的字段名（fieldKeyOf 算好的）
const groups = computed(() =>
  groupQuestions(questions.value).map((group) => ({
    ...group,
    questions: group.questions.map((q) => ({ ...q, key: fieldKeyOf(q) })),
  }))
)

const totalSteps = computed(() => groups.value.length)
const currentGroup = computed(() => groups.value[step.value] || { questions: [] })
const isFirst = computed(() => step.value === 0)
const isLast = computed(() => step.value >= totalSteps.value - 1)
const percent = computed(() =>
  totalSteps.value ? Math.round(((step.value + 1) / totalSteps.value) * 100) : 0
)

// 必填规则按题目自动生成：以后题库加题，这里不用动。
// 填空题（补充说明）是选填，不生成规则。
const rules = computed(() => {
  const generated = {}
  questions.value.forEach((q) => {
    const key = fieldKeyOf(q)
    if (!key || q.q_type === 'text') return
    if (q.q_type === 'multi') {
      generated[key] = [
        { type: 'array', required: true, min: 1, message: '至少选一项', trigger: 'change' },
      ]
      return
    }
    generated[key] = [{ required: true, message: '这一题还没选', trigger: 'change' }]
  })
  return generated
})

/** 当前这一屏涉及哪些字段 —— 只校验这些 */
const currentFields = computed(() => currentGroup.value.questions.map((q) => q.key).filter(Boolean))

const username = computed(() => userStore.userInfo?.username || localUsername())

// 「最多选 N 个」：超了就砍掉多的，并提示
watch(
  () => answers.interest,
  (val) => {
    if (Array.isArray(val) && val.length > MULTI_MAX) {
      answers.interest = val.slice(0, MULTI_MAX)
      ElMessage.warning(`最多选 ${MULTI_MAX} 个`)
    }
  }
)

// 「都没有」是互斥项：选了它就不该再选别的，反之亦然。
// 判断谁"最后被点"的办法：看它在不在上一轮的值里。
watch(
  () => answers.experience,
  (val, old) => {
    if (!Array.isArray(val) || val.length < 2 || !val.includes('都没有')) return
    const hadNoneBefore = Array.isArray(old) && old.includes('都没有')
    answers.experience = hadNoneBefore ? val.filter((v) => v !== '都没有') : ['都没有']
  }
)

function applyExisting(answer) {
  answers.direction = answer.direction || ''
  answers.grade = answer.grade || ''
  // status 里的键名（major_type / school_level / score / english）和 answers 是一致的
  Object.assign(answers, answer.status || {})
  answers.interest = answer.interest || []
  answers.extra_note = answer.extra_note || ''
}

async function loadQuestions() {
  loading.value = true
  try {
    const data = await fetchQuestions()
    questions.value = data.list || []
    Object.assign(answers, emptyAnswers(questions.value))

    // 以前填过的话，把答案填回去，方便修改
    const existing = await fetchAnswers(username.value)
    if (existing && existing.filled && existing.answer) {
      applyExisting(existing.answer)
    }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // 真后端登录后资料还没拉过（登录接口只返回 token），先补一次 ——
  // 不然不知道"这是谁"，问卷不知道该存到谁名下
  if (!userStore.userInfo) {
    await userStore.fetchInfo().catch(() => {})
  }
  await loadQuestions()
})

function toTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** 下一步：只校验这一屏 */
async function next() {
  if (!currentFields.value.length) {
    step.value += 1
    toTop()
    return
  }
  try {
    await formRef.value.validateField(currentFields.value)
  } catch {
    return // 红字已经显示在题目下方
  }
  step.value += 1
  toTop()
}

function prev() {
  step.value -= 1
  toTop()
}

function goAfterDone() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  router.replace(redirect && redirect !== '/survey' ? redirect : { name: 'home' })
}

/** 兜底：万一有人跳着填，直接送到第一个没答完的屏 */
function jumpToFirstBlank() {
  const index = groups.value.findIndex((group) =>
    group.questions.some((q) => {
      if (q.q_type === 'text') return false // 选填的不算漏
      const value = answers[q.key]
      return Array.isArray(value) ? value.length === 0 : !value
    })
  )
  if (index >= 0) {
    step.value = index
    toTop()
    return true
  }
  return false
}

async function handleSubmit() {
  try {
    await formRef.value.validate()
  } catch {
    if (jumpToFirstBlank()) {
      ElMessage.warning('还有题目没选，已经帮你跳过去了')
    }
    return
  }

  submitting.value = true
  try {
    // buildPayload 负责把页面上的答案转成后端要的形状
    // （direction / grade / status{...} / interest[] / extra_note）
    const payload = buildPayload(answers)
    const result = await submitAnswers(username.value, payload)

    if (result.savedLocal === false) {
      ElMessage.error('保存失败了：浏览器可能禁用了本地存储')
      return
    }

    if (result.synced) {
      ElMessage.success('问卷已提交')
    } else {
      // 后端问卷接口还没上线 —— 不拦住用户，但如实说清楚存在哪
      ElMessage.warning('已保存到本机（后端问卷接口还没上线）')
    }

    goAfterDone()
  } catch (e) {
    ElMessage.error(e.message || '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

async function handleSkip() {
  await skipSurvey(username.value)
  ElMessage.info('已跳过，随时可以回来重新填')
  goAfterDone()
}
</script>

<template>
  <div class="page page--narrow">
    <h1 class="page__title">规划问卷</h1>
    <p class="page__subtitle">两分钟填完，之后给你看和你情况相近的人是怎么走的</p>

    <div class="card">
      <div v-if="loading" class="muted">正在加载题目…</div>

      <div v-else-if="!questions.length" class="muted">
        题目加载失败了，请刷新页面重试。
      </div>

      <template v-else>
        <!-- 进度：一眼看出走到第几步 -->
        <el-steps :active="step" align-center finish-status="success" class="steps">
          <el-step v-for="g in groups" :key="g.name" :title="g.title" />
        </el-steps>

        <div class="progress-line">
          <span class="progress-line__text">第 {{ step + 1 }} 步 / 共 {{ totalSteps }} 步</span>
          <el-progress
            class="progress-line__bar"
            :percentage="percent"
            :show-text="false"
            :stroke-width="4"
          />
          <span class="progress-line__percent">{{ percent }}%</span>
        </div>

        <h2 class="group-title">{{ currentGroup.title }}</h2>
        <p class="group-desc">{{ currentGroup.desc }}</p>

        <el-form
          ref="formRef"
          :model="answers"
          :rules="rules"
          label-position="top"
          require-asterisk-position="right"
          @submit.prevent="handleSubmit"
        >
          <!--
            三屏都在同一个 form 里，只是把非当前的藏起来。
            这样点"提交"时 el-form 能一次性校验全部题目，
            漏填的一定会被发现，不会出现"提交了但其实少答一题"。
          -->
          <div v-for="(g, i) in groups" v-show="i === step" :key="g.name">
            <el-form-item
              v-for="q in g.questions"
              :key="q.id"
              :label="q.content"
              :prop="q.key"
            >
              <!-- 单选 -->
              <el-radio-group v-if="q.q_type === 'single'" v-model="answers[q.key]" class="option-group">
                <el-radio v-for="opt in q.options" :key="opt" :value="opt" class="option">
                  {{ opt }}
                </el-radio>
              </el-radio-group>

              <!-- 多选 -->
              <el-checkbox-group
                v-else-if="q.q_type === 'multi'"
                v-model="answers[q.key]"
                class="option-group"
              >
                <el-checkbox v-for="opt in q.options" :key="opt" :value="opt" class="option">
                  {{ opt }}
                </el-checkbox>
              </el-checkbox-group>

              <!-- 填空（选填） -->
              <el-input
                v-else
                v-model="answers[q.key]"
                type="textarea"
                :rows="3"
                maxlength="200"
                show-word-limit
                placeholder="选填，想到什么写什么"
              />
            </el-form-item>
          </div>
        </el-form>

        <div class="actions">
          <el-button v-if="!isFirst" @click="prev">上一步</el-button>
          <span class="actions__gap"></span>

          <el-button v-if="!isLast" type="primary" @click="next">下一步</el-button>
          <el-button v-else type="primary" :loading="submitting" @click="handleSubmit">
            {{ submitting ? '提交中…' : '提交问卷' }}
          </el-button>
        </div>

        <p class="skip-line">
          <button class="btn btn--text" @click="handleSkip">以后再说，先随便逛逛</button>
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.steps {
  margin-bottom: 10px;
}

.progress-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
}

.progress-line__text,
.progress-line__percent {
  flex: none;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.progress-line__bar {
  flex: 1;
}

.group-title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 500;
}

.group-desc {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--text-2);
}

/* 选项做成"能点的卡片"，比一排小圆点好点得多，手机上也够大 */
.option-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.option-group :deep(.el-radio),
.option-group :deep(.el-checkbox) {
  height: auto;
  /* 组件库默认给相邻项留了外边距，这里改用 grid 的 gap 控制间距 */
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  transition: border-color 0.18s, background-color 0.18s;
}

.option-group :deep(.el-radio:hover),
.option-group :deep(.el-checkbox:hover) {
  border-color: var(--border-strong);
}

.option-group :deep(.el-radio.is-checked),
.option-group :deep(.el-checkbox.is-checked) {
  border-color: var(--primary);
  background: var(--primary-weak);
}

.option-group :deep(.el-radio__label),
.option-group :deep(.el-checkbox__label) {
  font-size: 14px;
  white-space: normal;
  line-height: 1.5;
}

.actions {
  display: flex;
  align-items: center;
  margin-top: 24px;
}

.actions__gap {
  flex: 1;
}

.skip-line {
  margin: 16px 0 0;
  text-align: center;
}

@media (max-width: 480px) {
  .option-group {
    grid-template-columns: 1fr;
  }
}
</style>
