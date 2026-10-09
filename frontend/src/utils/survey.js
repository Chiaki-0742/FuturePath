import { getToken } from './token'

/**
 * 问卷的题目、字段映射、本地存放处。
 *
 * ------------------------------------------------------------------
 * 题目以谁为准？
 *
 *   以【后端数据库】为准 —— 题库存在 `questions` 表里（C 的 init.sql 第 9 步，
 *   一共 9 题），前端通过 `GET /api/questions` 拿。
 *
 *   下面这份 FALLBACK_QUESTIONS 是"离线版"，用途只有一个：
 *   后端还没起来、或者接口还没写好时，问卷页照样能打开、能演示。
 *   它的内容与 init.sql 里那 9 条 INSERT 【一字不差】——
 *   两边一旦不一致，联调时会出现"题目对不上字段"这种最难查的问题。
 *   ⚠️ 所以：改题目请先改数据库，再同步改这里。
 * ------------------------------------------------------------------
 * 提交给后端的格式（接口文档 3.2 节）：
 *
 *   {
 *     direction: "考研",                 // A 组：一个字
 *     grade: "大三",                      // B 组第 1 题单独提出来
 *     status: {                          // B 组其余 5 题
 *       major_type: "理工类",
 *       school_level: "普通一本",
 *       score: "前30%",
 *       english: "已过六级",
 *       experience: ["实习", "竞赛获奖"]   // 多选，数组
 *     },
 *     interest: ["具体怎么准备"],          // C 组第 1 题，多选，最多 3 个
 *     extra_note: "数学基础比较差"          // C 组第 2 题，选填
 *   }
 *
 *   注意 status 里的键名是后端定的（major_type / school_level / score / english），
 *   和题干的顺序一一对应。所以下面要维护一张"第几题 → 哪个键"的映射表。
 * ------------------------------------------------------------------
 */

/**
 * 离线题库。与 backend/init.sql 第 9 步的 9 条 INSERT 保持一致。
 * 字段名也刻意与接口返回一致（group_name / q_type / order_no），这样
 * "接口来的题目"和"本地题目"是同一个形状，页面代码只要写一套。
 */
export const FALLBACK_QUESTIONS = [
  // ---- A 组：未来方向（1 题）----
  {
    id: 1,
    group_name: 'direction',
    content: '你毕业后最想走哪条路？',
    q_type: 'single',
    options: ['考研', '就业', '考公', '留学', '创业', '还没想好'],
    order_no: 1,
  },

  // ---- B 组：当前现状（6 题）----
  {
    id: 2,
    group_name: 'status',
    content: '你现在大几？',
    q_type: 'single',
    options: ['大一', '大二', '大三', '大四', '研究生'],
    order_no: 1,
  },
  {
    id: 3,
    group_name: 'status',
    content: '你的专业属于哪一类？',
    q_type: 'single',
    options: ['理工类', '文史类', '经管类', '艺术类', '医学类', '其他'],
    order_no: 2,
  },
  {
    id: 4,
    group_name: 'status',
    content: '你的学校属于哪个层次？',
    q_type: 'single',
    options: ['985/211', '普通一本', '二本', '专科'],
    order_no: 3,
  },
  {
    id: 5,
    group_name: 'status',
    content: '你的成绩在专业里大概什么水平？',
    q_type: 'single',
    options: ['前10%', '前30%', '中等', '偏下'],
    order_no: 4,
  },
  {
    id: 6,
    group_name: 'status',
    content: '你的英语水平？',
    q_type: 'single',
    options: ['已过六级', '已过四级', '未过四级'],
    order_no: 5,
  },
  {
    id: 7,
    group_name: 'status',
    content: '你已经有哪些经历？（可多选）',
    q_type: 'multi',
    options: ['实习', '科研', '竞赛获奖', '学生工作', '项目经历', '都没有'],
    order_no: 6,
  },

  // ---- C 组：最想了解什么（2 题）----
  {
    id: 8,
    group_name: 'interest',
    content: '你最想搞清楚哪些问题？（最多选3个）',
    q_type: 'multi',
    options: [
      '该选哪条路',
      '每条路的利弊',
      '具体怎么准备',
      '时间节点怎么安排',
      '需要具备什么能力',
      '怎么弥补短板',
    ],
    order_no: 1,
  },
  {
    id: 9,
    group_name: 'interest',
    content: '还有什么想告诉我们的？（选填）',
    q_type: 'text',
    options: [],
    order_no: 2,
  },
]

/** 三屏的顺序与界面文案（接口不返回这些，是纯界面的事） */
export const GROUPS = [
  { name: 'direction', title: '未来方向', desc: '先说最重要的一件事' },
  { name: 'status', title: '当前现状', desc: '这些用来找和你情况相近的人' },
  { name: 'interest', title: '想了解什么', desc: '告诉我们要重点讲什么' },
]

export const MULTI_MAX = 3

/**
 * B 组题目 → 提交字段名。
 *
 * 为什么需要这张表？因为后端要的 status 是 { major_type, school_level, ... }
 * 这种带下划线的键，而题目本身只有"第几题"。
 * 键名由接口文档 3.2 节定死，不能自己改。
 */
const STATUS_KEY_BY_ORDER = {
  1: 'grade', // 年级要单独提出来，不是放在 status 里
  2: 'major_type',
  3: 'school_level',
  4: 'score',
  5: 'english',
  6: 'experience',
}

/** 一道题对应答案里的哪个字段名 */
export function fieldKeyOf(question) {
  if (question.group_name === 'direction') return 'direction'
  if (question.group_name === 'interest') {
    // C 组第 2 题是填空（补充说明），第 1 题是多选
    return question.q_type === 'text' ? 'extra_note' : 'interest'
  }
  if (question.group_name === 'status') {
    return STATUS_KEY_BY_ORDER[question.order_no] || `status_${question.order_no}`
  }
  return ''
}

/** 按 group_name 分成三组，组内按 order_no 排序（后端也是按 order_no 排的） */
export function groupQuestions(list) {
  return GROUPS.map((group) => ({
    ...group,
    questions: (list || [])
      .filter((q) => q.group_name === group.name)
      .slice()
      .sort((a, b) => a.order_no - b.order_no),
  }))
}

/** 一份空白答案。加载完题目后调用，键名和题目一一对应 */
export function emptyAnswers(questions) {
  const answers = {}
  ;(questions || []).forEach((q) => {
    const key = fieldKeyOf(q)
    if (!key) return
    answers[key] = q.q_type === 'multi' ? [] : ''
  })
  return answers
}

/**
 * 把页面上的答案组装成 POST /api/answers 要求的形状。
 * 这个转换只在这一处做，页面不用关心后端的字段长什么样。
 */
export function buildPayload(answers) {
  const status = {}
  Object.entries(STATUS_KEY_BY_ORDER).forEach(([, key]) => {
    if (key === 'grade') return
    if (answers[key] !== undefined && answers[key] !== '') status[key] = answers[key]
  })

  return {
    direction: answers.direction || '',
    grade: answers.grade || '',
    status,
    interest: Array.isArray(answers.interest) ? answers.interest : [],
    extra_note: (answers.extra_note || '').trim(),
  }
}

// ---------------------------------------------------------------
// 本地存放
// ---------------------------------------------------------------

const KEY_PREFIX = 'plan_survey_'

/**
 * 每个账号存一份，key 里带上用户名 ——
 * 一台电脑上常会注册好几个账号，共用一个 key 会让新账号看到上一个人的答案，
 * "新用户该不该被引导"也会判断错。
 */
export function surveyKey(username) {
  return KEY_PREFIX + username
}

/**
 * 从 token 里反解用户名 —— 只在 mock 模式下有效。
 * mock 的 token 是自己拼的（mock-token.用户名.时间戳），能反解；
 * 真后端发的是一串随机字符，反解不出来，只能靠 /api/me 拿到的资料。
 */
export function localUsername() {
  const parts = getToken().split('.')
  return parts[0] === 'mock-token' ? parts[1] || '' : ''
}

export function readSurvey(username) {
  if (!username) return null
  try {
    const raw = localStorage.getItem(surveyKey(username))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeSurvey(username, data) {
  if (!username) return false
  try {
    localStorage.setItem(surveyKey(username), JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function clearSurvey(username) {
  if (!username) return
  try {
    localStorage.removeItem(surveyKey(username))
  } catch {
    /* 忽略 */
  }
}

/**
 * 这个人处理过问卷了吗？
 * "处理过"包含填完的和点了"以后再说"跳过的 ——
 * 只认填完的话，跳过的人每次进页面都会被弹回来，像是页面坏了。
 */
export function hasSurveyRecord(username) {
  return !!readSurvey(username)
}

/** 取问卷里的方向（"考研""考公"这种）。跳过或没填过时返回空串 */
export function surveyDirection(username) {
  const record = readSurvey(username)
  if (!record || record.skipped) return ''
  return record.direction || ''
}

/**
 * 取问卷里填的年级（"大三"这种）。跳过或没填过时返回空串。
 *
 * ⚠️ 这个和账号资料里的 `user.grade` 不是一回事，别混用：
 *   user.grade       —— 注册时填的，之后不动，可能早就过期了
 *   answers.grade    —— 问卷里填的（这里读的就是它），是"现在的真实年级"
 *
 * 案例页按"方向 + 年级"匹配案例时用的必须是后者：一个注册时填了"大一"、
 * 现在读大三的人，要看的是大三学长学姐的路线，不是大一时的。
 * 后端 case.py 里也是这个口径（不传 grade 时它取的就是 answers.grade）——
 * 前端要是把 user.grade 传过去，等于用错的值把后端正确的兜底覆盖掉了。
 */
export function surveyGrade(username) {
  const record = readSurvey(username)
  if (!record || record.skipped) return ''
  return record.grade || ''
}
