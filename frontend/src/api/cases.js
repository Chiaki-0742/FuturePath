import request from './request'
import { USE_MOCK } from './config'
import {
  FALLBACK_CASES,
  fallbackCase,
  fallbackSteps,
  isRelaxed,
  pickCases,
} from '@/utils/cases'

/**
 * 案例相关接口。对应接口文档（docs/接口文档-第二阶段.md）3.4 节：
 *
 *   GET /api/cases        获取推荐案例（可按方向/年级筛选）
 *
 * 沿用 api/survey.js 的老套路：开 Mock 走本地，关 Mock 发真请求，
 * 两条路返回值格式完全一致（都是拆过包的 data 加几个提示字段），页面不用关心连的是哪个。
 *
 * ------------------------------------------------------------------
 * ⚠️ 现在的实际情况（2026-10-02）：
 *
 *   这个接口由同学负责后端实现，目前【还没上线】（实测 404）。
 *   所以这里做了两层兜底：
 *
 *   1. 开 Mock 时，用 utils/cases.js 里的离线案例库 + 本地筛选，
 *      列表页能完整跑通（筛选、切换、空方向兜底）。
 *
 *   2. 关 Mock（连真后端）时，真请求一旦失败（接口 404 / 后端没起），
 *      自动回落到本地，页面不会白屏，只是返回值里 synced = false。
 *
 *   后端接口上线后，什么都不用改 —— 真请求成功了自然会走接口那条路。
 *
 *   注意一个刻意的设计：就算接口通了、但返回的列表是【空的】，
 *   也会回落到本地案例库。原因见下面 fetchCases 里的注释 ——
 *   案例页空着比"数据稍微不准"难看得多。
 * ------------------------------------------------------------------
 */

/**
 * 取案例列表。
 *
 * 入参（都可选，跟接口文档的 query 参数一一对应）：
 *   direction  方向，如 '考研'；不传 = 不筛方向
 *   grade      年级，如 '大三'；传了会优先展示同年级的
 *   limit      最多返回几条，默认 6
 *
 * 返回：
 *   {
 *     list:      [ 案例... ],   // 最多 limit 条
 *     total:     数字,          // 匹配到的总数
 *     direction: '考研' | '',   // 当前筛的方向，'' 表示没筛
 *     relaxed:   true/false,    // true = 这个方向没案例，给的是其他方向的
 *     synced:    true/false,    // true = 服务器数据，false = 本地兜底
 *   }
 */
export async function fetchCases({ direction = '', grade = '', limit = 6 } = {}) {
  const local = () => pickCases({ direction, grade, limit }, FALLBACK_CASES)

  if (USE_MOCK) {
    return { ...local(), synced: true }
  }

  // 只把有值的参数发出去，避免把 direction= 这种空参数发给后端
  const params = {}
  if (direction) params.direction = direction
  if (grade) params.grade = grade
  if (limit) params.limit = limit

  try {
    const data = await request.get('/cases', { params })
    const list = (data && data.list) || []

    // 接口通了，但一条都没返回 —— 也走本地兜底。
    // 理由：用户选了个冷门方向（比如"创业"）时，接口文档 3.4 节的规则是
    // "放宽为只要 direction 对上就返回"，可要是连方向对上的都没有，
    // 后端就只能返回空。案例页空着、比「数据稍微不准」难看得多，
    // 所以宁可拿本地案例库里的相近案例顶上，也别给用户一个白页面。
    if (!list.length) return { ...local(), synced: true, emptyFromServer: true }

    // 这批案例是不是"被放宽过的"（请求了某方向，返回的却是别方向的）。
    //
    // ⚠️ 这里曾经硬写成 relaxed: false，是错的（后端同学 review 时指出）。
    //    后果：用户选"创业"，后端放宽后返回了别方向的案例，页面上却写着
    //    "共 10 条「创业」的案例" —— 那 10 条根本不是创业案例，等于骗用户。
    //
    // 现在交给 isRelaxed()：后端有返回就以后端为准，后端没返回就自己算。
    // 为什么还要"自己算"这一手？因为 C 的接口文档 3.4 节里【没有】定义
    // relaxed 字段，它属于后端多加的信息。哪天后端不返回了，前端也得判对。
    const relaxed = isRelaxed(list, direction, data.relaxed)

    return {
      list,
      total: typeof data.total === 'number' ? data.total : list.length,
      direction: direction || '',
      relaxed,
      synced: true,
    }
  } catch {
    // 接口还没上线（404）或后端没起 —— 用离线案例库，页面照样能用
    return { ...local(), synced: false }
  }
}

/**
 * 取案例详情。对应接口文档 3.5 节：
 *
 *   GET /api/cases/<id>   案例详情（带 steps 时间线）
 *
 * 详情比列表多的两个字段：
 *   experience —— 经验教训（列表页【故意不返回】，详情页才有）
 *   steps      —— 时间线，每项 { phase, content, is_key, order_no }
 *
 * 失败时会怎么办：
 *   接口 404 / 后端没起 → 回落到离线案例库（内容与数据库一致），synced = false
 *   这个 id 本地也没有   → 返回 null，由页面显示"这条案例不存在"
 *
 * ⚠️ 一个必须知道的前提：本地步骤库的 id 必须和数据库的 id 对得上。
 *    init.sql 里 10 条案例的 id 就是 1-10，所以能对上；
 *    如果哪天数据库改成从别的数字开始自增，这里会错位，
 *    表现是"点进去看到的是别人案例的时间线"。改数据时记得同步。
 */
export async function fetchCaseDetail(id) {
  // 本地兜底：案例 + 它自己的步骤，形状和接口返回完全一致
  const local = () => {
    const item = fallbackCase(id)
    if (!item) return null
    return { ...item, steps: fallbackSteps(id), synced: false }
  }

  if (USE_MOCK) {
    const data = local()
    return data ? { ...data, synced: true } : null
  }

  try {
    const data = await request.get('/cases/' + encodeURIComponent(id))
    // 接口通了但没给出案例主体（比如返回了个空对象）—— 别让页面拿到半个东西
    if (!data || !data.id) throw new Error('empty detail')
    return {
      ...data,
      // steps 一定要是数组。后端某天忘了带这个字段，
      // 页面上就会因为 steps.length 报错而白屏 —— 这里先兜住。
      steps: Array.isArray(data.steps) ? data.steps : [],
      synced: true,
    }
  } catch {
    return local()
  }
}
