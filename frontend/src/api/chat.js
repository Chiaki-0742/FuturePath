import request from './request'
import { USE_MOCK } from './config'
import { localUsername, readSurvey } from '@/utils/survey'
import {
  DAILY_LIMIT,
  appendLog,
  countLogs,
  demoAnswer,
  readLogs,
} from '@/utils/chat'

/**
 * 对话接口。对应后端 chat.py 的两个接口：
 *
 *   POST /api/chat        向大模型提问（需登录，且必须先填过问卷）
 *   GET  /api/chat/logs   我的提问记录（需登录）
 *
 * 后端返回的 data 形状：
 *   { answer, tokens_used, mock, model, system_prompt }
 *   mock = true 表示后端【没配大模型 key】，回答是它的降级固定文案，
 *   页面会据此显示"演示模式"（组员本地没建 .env 时就是这个状态）。
 *
 * ------------------------------------------------------------------
 * ⚠️ 这里和别的接口不一样：真接口失败时【不做静默回落】。
 *
 * 问卷、案例那两个接口失败时会回落到本地内置数据，页面不白屏 ——
 * 那是合理的，因为数据是死的、内容也是真的。
 * 但对话不行：假回答混进真回答里，用户根本看不出哪句是 AI 说的，
 * 这比直接报错糟糕得多。所以真接口这条路失败就如实抛错，
 * 由页面给出人话提示（见 Chat.vue 的 handleError）。
 * ------------------------------------------------------------------
 */

/** 造一个带错误码的 Error —— 页面靠 code 区分"没填问卷/次数用完/AI 挂了" */
function fail(code, msg) {
  const err = new Error(msg)
  err.code = code
  return Promise.reject(err)
}

/**
 * 提问。
 * 返回 { answer, tokens_used, mock, model, system_prompt }
 *
 * ★ 注意第二个参数：单次请求超时放宽到 55 秒。
 *   request.js 里全局设的是 10 秒 —— 那对普通接口足够，
 *   但大模型要生成几百字，实测要 4~6 秒，网络一抖就会撞上 10 秒，
 *   用户看到的是"请求超时"，其实 AI 正在正常回答。
 *   后端自己的模型超时是 45 秒，前端给它留到 55 秒（略长一点，
 *   这样"到底谁超时"是明确的：先由后端报 AI 不可用，而不是前端先断）。
 */
export async function askAI(question) {
  if (USE_MOCK) return mockAsk(question)

  return request.post('/chat', { question }, { timeout: 55000 })
}

/**
 * 我的提问记录。
 * 返回 { list（倒序）, total, daily_limit, remaining }
 *
 * ★ 这个接口失败【不用弹错】—— 历史拉不到不影响提问，
 *   页面按"暂时没有记录"展示即可（返回里带 failed 标记，供页面区分措辞）。
 */
export async function fetchChatLogs(limit = 20) {
  if (USE_MOCK) return mockLogs(limit)

  try {
    return await request.get('/chat/logs', { params: { limit } })
  } catch {
    return { list: [], total: 0, daily_limit: DAILY_LIMIT, remaining: null, failed: true }
  }
}

// ---------------------------------------------------------------
// 以下只在 Mock 模式（不连后端）时走，返回值与真接口完全一致
// ---------------------------------------------------------------

function mockAsk(question) {
  const username = localUsername()

  // 后端是把"没填问卷"作为 1005 返回的，这里照抄它的判断，
  // 页面才能走到同一套引导（不会出现"mock 里好好的、连真后端才提示"）。
  const logs = readLogs(username)
  const record = readSurvey(username)
  if (!record || record.skipped) {
    return fail(1005, '请先完成问卷，我才能针对你的情况回答')
  }
  if (logs.length >= DAILY_LIMIT) {
    return fail(1007, '今日提问次数已用完，明天再来')
  }

  const answer = demoAnswer(question, username)
  appendLog(username, { question, answer, tokens_used: 0 })
  return { answer, tokens_used: 0, mock: true, model: '', system_prompt: '' }
}

function mockLogs(limit) {
  const username = localUsername()
  // 本地是按时间正序存的，接口约定是倒序（最近的在前面）
  const list = readLogs(username).slice().reverse().slice(0, limit)
  const used = countLogs(username)
  return {
    list,
    total: used,
    daily_limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - used),
  }
}
