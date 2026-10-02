import request from './request'
import { USE_MOCK } from './config'
import { FALLBACK_QUESTIONS, readSurvey, writeSurvey } from '@/utils/survey'

/**
 * 问卷相关接口。对应接口文档（docs/接口文档-第二阶段.md）第二节的三个：
 *
 *   GET  /api/questions   获取题目        （不用登录）
 *   POST /api/answers     提交答案
 *   GET  /api/answers     查我的问卷结果
 *
 * 沿用 api/user.js 的老套路：开 Mock 走本地，关 Mock 发真请求，
 * 两条路返回值格式完全一致（都是拆过包的 data），页面不用关心连的是哪个。
 *
 * ------------------------------------------------------------------
 * ⚠️ 现在的实际情况（2026-10-02）：
 *
 *   这三个接口由同学负责后端实现，目前【还没上线】。
 *   所以这里做了两件事：
 *
 *   1. 开 Mock 时，用 utils/survey.js 里的离线题库 + 本地存储，
 *      问卷页能完整跑通（填、校验、提交、首页显示方向）。
 *
 *   2. 关 Mock（连真后端）时，真请求一旦失败（接口 404 / 后端没起），
 *      自动回落到本地，页面不会白屏，只是返回值里 synced = false，
 *      页面会提示"已保存在本机"。
 *      这样联调时能一眼看出"后端这块还缺"，而不是看到一个莫名其妙的报错。
 *
 *   后端接口上线后，什么都不用改 —— 真请求成功了自然会走接口那条路。
 * ------------------------------------------------------------------
 */

/** 本地那份问卷结果，包装成和 GET /api/answers 一样的形状 */
function localAnswers(username) {
  const record = readSurvey(username)
  if (!record || record.skipped) return { filled: false, answer: null }
  return { filled: true, answer: record }
}

/**
 * 获取问卷题目。
 * 返回 { list: [{ id, group_name, content, q_type, options, order_no }] }
 *
 * 后端契约：不需登录；options 必须是【数组】（后端要把数据库里的 JSON 串解析好再返回）。
 */
export async function fetchQuestions() {
  if (USE_MOCK) return { list: FALLBACK_QUESTIONS }

  try {
    const data = await request.get('/questions')
    // 防御：万一后端把 options 当字符串返回了（接口文档特别提醒过这一点），
    // 页面会渲染成一串乱码。这里兜一层，遇到字符串就自己解析。
    const list = (data && data.list) || []
    list.forEach((q) => {
      if (typeof q.options === 'string') {
        try {
          q.options = JSON.parse(q.options)
        } catch {
          q.options = []
        }
      }
    })
    return { list }
  } catch {
    // 后端还没这个接口 —— 用离线题库，页面照样能用
    return { list: FALLBACK_QUESTIONS }
  }
}

/**
 * 查询我的问卷结果。
 * 返回 { filled: bool, answer: {...} | null }
 *
 * 注意接口文档的设计：没填过【不报错】，用 filled:false 表示，
 * 因为"进首页顺手查一下"是正常流程，不是错误。
 */
export async function fetchAnswers(username) {
  if (USE_MOCK) return localAnswers(username)

  try {
    return await request.get('/answers')
  } catch {
    return localAnswers(username)
  }
}

/**
 * 提交问卷答案。
 * 入参就是 buildPayload() 组装好的那 5 个字段：
 *   { direction, grade, status, interest, extra_note }
 * 一个用户只有一份问卷，后端是"有则覆盖"，所以重复提交不会报错。
 */
export async function submitAnswers(username, payload) {
  const record = {
    ...payload,
    skipped: false,
    created_at: new Date().toISOString(),
  }

  // 本地这一份必须写：新手引导要判断"填过没"，而路由守卫是同步的，等不了网络
  const savedLocal = writeSurvey(username, record)

  if (USE_MOCK) {
    return { id: record.created_at, savedLocal, synced: true }
  }

  try {
    const data = await request.post('/answers', payload)
    return { ...(data || {}), savedLocal, synced: true }
  } catch (e) {
    return { savedLocal, synced: false, syncError: e.message }
  }
}

/**
 * "以后再说"。
 *
 * C 的设计里没有这个，但问卷页必须能退出去 ——
 * 只能填不能退的话，演示时会被卡在问卷页，看起来像页面坏了。
 * 跳过也记一笔（标记 skipped），之后不再拦，随时能回来重填。
 */
export async function skipSurvey(username) {
  const record = { skipped: true, created_at: new Date().toISOString() }
  writeSurvey(username, record)
  return record
}
