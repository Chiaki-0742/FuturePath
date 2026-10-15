<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { askAI, fetchChatLogs } from '@/api/chat'
import { useUserStore } from '@/stores/user'

/**
 * 问问 AI（对话页）。
 *
 * 这个页面和后端 chat.py 的 POST /api/chat 对接。它的特别之处在于：
 * 后端会把这个人的【问卷结果】拼进 prompt 再问模型，所以同一个问题，
 * 大三考研的人和大一还没想好的人，拿到的回答是不一样的
 * —— 这也是页面上那句"会带着你的情况回答"的由来。
 *
 * 三个要照顾到的状态（都是真实会发生的）：
 *   1. 没有填过问卷 → 后端返回 1005，页面转成"先去填问卷"的引导，
 *      而不是弹一句红字错误（用户会不知道下一步该干嘛）
 *   2. 今天问满 20 次 → 1007，次数条直接归零并说明明天恢复
 *   3. 后端没配大模型 key（组员本地）→ 接口照样成功，但 data.mock = true，
 *      页面挂一个「演示模式」标记，避免把那固定文案当成真 AI 的回答
 */

const userStore = useUserStore()

// 和后端 chat.py 的 QUESTION_MAX 保持一致
const QUESTION_MAX = 500

const question = ref('')
const messages = ref([])        // [{ id, role: 'user'|'ai', text, mock, model, tokens }]
const thinking = ref(false)
const loading = ref(true)
const errorTip = ref('')
const needSurvey = ref(false)   // 收到 1005 后置为 true，页面换成引导
const remaining = ref(null)     // 今天还能问几次；null = 还没问过后端，不知道
const dailyLimit = ref(20)
const streamEl = ref(null)

const examples = [
  '我现在大三，这个寒假该先做什么？',
  '英语不太好，会影响我的方向吗？',
  '怎么判断自己适不适合跨专业？',
]

const canAsk = computed(
  () =>
    !thinking.value &&
    !needSurvey.value &&
    question.value.trim().length > 0 &&
    (remaining.value === null || remaining.value > 0)
)

function metaText(m) {
  if (m.role !== 'ai') return ''
  if (m.mock) return '演示模式 · 后端没有配大模型 key'
  const parts = []
  if (m.model) parts.push(`由 ${m.model} 生成`)
  if (m.tokens) parts.push(`用了 ${m.tokens} token`)
  return parts.join(' · ')
}

async function scrollToBottom() {
  await nextTick()
  const el = streamEl.value
  if (el) el.scrollTop = el.scrollHeight
}

onMounted(load)

async function load() {
  loading.value = true
  errorTip.value = ''
  try {
    // 资料用来显示问候语；拉不到也不影响提问（后端自己认 token）
    await userStore.fetchInfo().catch(() => {})
    await loadLogs()
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

/**
 * 把历史记录铺成气泡 —— 这样用户离开再回来，能看到之前问过什么，
 * 而不是每次都面对一片空白（后端是存了的，不展示出来等于白存）。
 * 接口给的是倒序（最近的在前），页面要从早到晚读，所以反转一次。
 */
async function loadLogs() {
  const data = await fetchChatLogs(20)
  if (!data) return

  if (typeof data.daily_limit === 'number' && data.daily_limit > 0) {
    dailyLimit.value = data.daily_limit
  }
  if (typeof data.remaining === 'number') {
    remaining.value = data.remaining
  }

  const list = Array.isArray(data.list) ? data.list.slice().reverse() : []
  const built = []
  list.forEach((row) => {
    if (!row || !row.question) return
    built.push({ id: `q-${row.id}`, role: 'user', text: row.question })
    if (row.answer) {
      built.push({
        id: `a-${row.id}`,
        role: 'ai',
        text: row.answer,
        mock: false,
        model: '',
        tokens: row.tokens_used || 0,
      })
    }
  })
  messages.value = built
}

async function ask() {
  const q = question.value.trim()
  if (!canAsk.value) return

  errorTip.value = ''
  messages.value.push({ id: `u-${Date.now()}`, role: 'user', text: q })
  question.value = ''
  thinking.value = true
  scrollToBottom()

  try {
    const data = await askAI(q)
    messages.value.push({
      id: `a-${Date.now()}`,
      role: 'ai',
      text: (data && data.answer) || '（这次没有拿到回答内容，换个问法再试试）',
      mock: !!(data && data.mock),
      model: (data && data.model) || '',
      tokens: (data && data.tokens_used) || 0,
    })
    if (typeof remaining.value === 'number') {
      remaining.value = Math.max(0, remaining.value - 1)
    }
  } catch (e) {
    // 提问失败，把刚才那条"我以为问出去了"的气泡收回来 ——
    // 留着会让用户以为 AI 收到了问题只是在想
    messages.value.pop()
    handleError(e)
  } finally {
    thinking.value = false
    scrollToBottom()
  }
}

function handleError(e) {
  const code = e && e.code

  if (code === 1005) {
    // 没填问卷。这不是"错误"，是"还差一步"，换成引导按钮
    needSurvey.value = true
    errorTip.value = ''
    return
  }

  if (code === 1007) {
    remaining.value = 0
    errorTip.value = '今天的提问次数已经用完了，明天会恢复'
    return
  }

  if (code === 2001) {
    errorTip.value = e.message || 'AI 暂时用不了，请稍后再试'
    return
  }

  // 没有 code 的，是根本没走到后端（后端没启动 / 断网 / 超时）
  errorTip.value = e.message || '提问失败，请稍后再试'
}

function useExample(text) {
  question.value = text
}
</script>

<template>
  <div class="page">
    <h1 class="page__title">问问 AI</h1>
    <p class="page__subtitle">
      它会带着你填的问卷情况来回答，所以同一个人问同一个问题，答案是不一样的
    </p>

    <div v-if="errorTip" class="alert alert--error">{{ errorTip }}</div>

    <!-- 没填问卷：把"错误"变成"下一步" -->
    <div v-if="needSurvey" class="alert alert--info">
      还差一步 —— 它要先知道你的年级、专业和方向，才能给出针对你的建议。
      <RouterLink to="/survey" class="alert__link">去填问卷</RouterLink>
    </div>

    <div class="card chat">
      <div class="chat__bar">
        <span class="quota">
          今天还能问
          <b>{{ remaining === null ? '—' : remaining }}</b>
          次
        </span>
        <span class="muted">每人每天最多 {{ dailyLimit }} 次</span>
      </div>

      <div ref="streamEl" class="stream">
        <div v-if="loading" class="stream__empty muted">正在加载你的提问记录…</div>

        <div v-else-if="!messages.length" class="stream__empty">
          <p class="stream__hi">
            你好，{{ userStore.userInfo?.name || userStore.userInfo?.username || '同学' }}
          </p>
          <p class="muted">
            还没有问过。可以从下面这几个开始，也可以直接写你想问的
          </p>
          <div class="chips chips--center">
            <button
              v-for="x in examples"
              :key="x"
              class="chip"
              type="button"
              @click="useExample(x)"
            >
              {{ x }}
            </button>
          </div>
        </div>

        <template v-else>
          <div
            v-for="m in messages"
            :key="m.id"
            class="msg"
            :class="m.role === 'user' ? 'msg--user' : 'msg--ai'"
          >
            <div class="bubble">
              <p class="bubble__text">{{ m.text }}</p>
            </div>
            <p v-if="metaText(m)" class="msg__meta">{{ metaText(m) }}</p>
          </div>

          <div v-if="thinking" class="msg msg--ai">
            <div class="bubble bubble--thinking">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              正在想…
            </div>
          </div>
        </template>
      </div>

      <div class="ask">
        <el-input
          v-model="question"
          type="textarea"
          :rows="3"
          resize="none"
          :maxlength="QUESTION_MAX"
          show-word-limit
          :disabled="needSurvey"
          placeholder="比如：我现在大三，考研这个寒假该先做什么？"
        />

        <div class="ask__foot">
          <div v-if="messages.length" class="chips">
            <button
              v-for="x in examples"
              :key="x"
              class="chip"
              type="button"
              @click="useExample(x)"
            >
              {{ x }}
            </button>
          </div>
          <span v-else class="muted ask__hint">
            问题写得越具体，回答越有用（比如带上你的年级、专业、卡在哪）
          </span>

          <button class="btn btn--primary" :disabled="!canAsk" @click="ask">
            <span v-if="thinking" class="spinner"></span>
            {{ thinking ? '正在想…' : '提问' }}
          </button>
        </div>
      </div>
    </div>

    <p class="footer-note">
      回答由大模型生成，可能不准确，重要决定请再找人确认一次
    </p>
  </div>
</template>

<style scoped>
.chat {
  padding: 20px 22px 22px;
}

/* 顶部那行次数：让用户提前知道"还剩几次"，而不是问满 20 次才被告知 */
.chat__bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-2);
}

.quota b {
  font-size: 16px;
  color: var(--primary);
  padding: 0 2px;
}

/* ---------------- 对话流 ---------------- */
.stream {
  max-height: 440px;
  overflow-y: auto;
  padding: 16px 2px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stream__empty {
  padding: 18px 4px;
  text-align: center;
}

.stream__hi {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 500;
}

.msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 86%;
}

.msg--user {
  align-self: flex-end;
  align-items: flex-end;
}

.msg--ai {
  align-self: flex-start;
}

.bubble {
  padding: 11px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.75;
}

.msg--user .bubble {
  background: var(--primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.msg--ai .bubble {
  background: var(--surface);
  border: 1px solid #e9edf4;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 2px rgba(28, 36, 48, 0.04);
}

/* ⚠️ 必须是 pre-line：模型回答里是有换行的（分点、空行），
   按默认的 normal 渲染会把整段挤成一坨，分点全没了。 */
.bubble__text {
  margin: 0;
  white-space: pre-line;
  word-break: break-word;
}

.msg__meta {
  margin: 0;
  padding: 0 4px;
  font-size: 12px;
  color: var(--text-3);
}

/* "正在想"的三个点 */
.bubble--thinking {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
  font-size: 13px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--primary);
  animation: blink 1.1s infinite ease-in-out;
}

.dot:nth-child(2) {
  animation-delay: 0.18s;
}

.dot:nth-child(3) {
  animation-delay: 0.36s;
}

@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

/* ---------------- 输入区 ---------------- */
.ask {
  border-top: 1px solid var(--border);
  padding-top: 14px;
}

.ask__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.ask__hint {
  flex: 1;
  min-width: 200px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
}

.chips--center {
  justify-content: center;
  margin-top: 14px;
}

.chip {
  padding: 5px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.chip:hover {
  border-color: var(--primary);
  background: var(--primary-weak);
  color: var(--primary);
}

.alert__link {
  margin-left: 6px;
  font-weight: 500;
}

@media (max-width: 560px) {
  .msg {
    max-width: 100%;
  }

  .ask__foot {
    flex-direction: column;
    align-items: stretch;
  }

  .ask__foot .btn {
    width: 100%;
  }
}
</style>
