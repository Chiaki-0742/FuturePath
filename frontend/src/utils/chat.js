/**
 * 对话相关的本地存放 + 演示回答。
 *
 * 为什么会需要这个文件？
 * 因为项目一直是两条腿走路（见 utils/survey.js、utils/cases.js 的写法）：
 *   开 Mock（VITE_USE_MOCK=true）→ 不连后端，用本地这份跑通页面
 *   连真接口                     → 用后端返回的真数据
 * 组员 clone 下来没有 .env、也还没起后端时，页面照样能打开、能点、能提交。
 *
 * ⚠️ 和案例、问卷不同的是：对话【有真实成本】，而且假回答会误导人。
 *    所以这里生成的演示回答会明确写上「演示模式」，让人一眼看出不是真的；
 *    而且真接口模式下【不做静默回落】—— 后端连不上就如实报错，
 *    绝不能拿一段假回答冒充 AI 的回答（那比报错糟糕得多）。
 */
import { readSurvey } from './survey'

const KEY_PREFIX = 'plan_chat_'

/**
 * 每日提问次数上限。
 * ⚠️ 这个数字必须和后端 chat.py 里的 DAILY_LIMIT 保持一致（现在都是 20）。
 * 改后端的时候记得回来改这里，否则 mock 模式下的"还能问几次"会和真接口对不上。
 */
export const DAILY_LIMIT = 20

/** 每个账号存一份，key 里带用户名 —— 一台电脑上常会注册好几个账号 */
export function chatKey(username) {
  return KEY_PREFIX + username
}

/** 读本地记录（按时间正序，和页面上气泡的先后顺序一致） */
export function readLogs(username) {
  if (!username) return []
  try {
    const raw = localStorage.getItem(chatKey(username))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** 追加一条记录，返回追加后的完整列表 */
export function appendLog(username, entry) {
  if (!username) return []
  const list = readLogs(username)
  list.push({
    id: `local-${Date.now()}`,
    question: entry.question,
    answer: entry.answer,
    tokens_used: entry.tokens_used ?? 0,
    created_at: nowText(),
  })
  try {
    localStorage.setItem(chatKey(username), JSON.stringify(list))
  } catch {
    /* 浏览器禁用了 localStorage，忽略即可（页面上的对话还在） */
  }
  return list
}

/** 本地记录一共用过几次（对应真接口的 total 字段） */
export function countLogs(username) {
  return readLogs(username).length
}

/** "2026-10-14 18:20:33" 这种格式，和后端 to_dict() 的写法保持一致 */
export function nowText() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

/**
 * 演示回答 —— 只把用户的画像回显出来，内容本身是固定的。
 *
 * ★ 它不是"假装 AI 在回答"，而是让整条链路（提问 → 校验 → 生成 → 落库 →
 *   页面渲染气泡）在没有后端时也能跑通、能被自检脚本覆盖。
 *   所以第一行就写明是演示，页面上也会另挂一个「演示模式」的标记。
 *
 * ★ 有真 key 的时候走不到这里（后端会返回真实回答，mock=false）。
 */
export function demoAnswer(question, username) {
  const record = readSurvey(username)
  const grade = (record && !record.skipped && record.grade) || '大学阶段'
  const direction = (record && !record.skipped && record.direction) || '还没想好'

  return (
    `（演示模式：当前没有连上后端，下面是固定文案 + 你的画像回显，不是 AI 的回答）\n\n` +
    `你问的是：「${question}」\n\n` +
    `按你填的情况 —— ${grade}、方向是「${direction}」—— 这个阶段最值得先做的三件事：\n` +
    `1. 把这学期剩下的时间拆成「必须完成」和「想做的」两栏，先保前者；\n` +
    `2. 找一个已经走在你想去的方向上的学长学姐，问清楚他当年这个阶段在做什么；\n` +
    `3. 把你现在能拿得出手的东西列一张清单（成绩、经历、证书），缺口一目了然。\n\n` +
    `想看真实的、针对你个人的回答，把后端起来就行（npm run dev 之前先把 frontend/.env 里的 ` +
    `VITE_USE_MOCK 改成 false）。`
  )
}
