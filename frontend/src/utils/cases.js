/**
 * 案例的离线数据与筛选规则。
 *
 * ------------------------------------------------------------------
 * 数据以谁为准？
 *
 *   以【后端数据库】为准 —— 案例存在 `cases` 表里（C 的 init.sql 第 10 步，
 *   一共 10 条），前端通过 `GET /api/cases` 拿。
 *
 *   下面这份 FALLBACK_CASES 是"离线版"，用途只有一个：
 *   后端还没起来、或者接口还没写好时，案例列表页照样能打开、能演示。
 *   它的内容与 init.sql 里那 10 条 INSERT 【一字不差】——
 *   两边一旦不一致，联调时会出现"列表里有、点进去没有"这种最难查的问题。
 *   ⚠️ 所以：改案例请先改数据库，再同步改这里。
 * ------------------------------------------------------------------
 *
 * 顺带记一个已知的【数据不一致】，还没解决，等 C 拍板：
 *
 *   问卷第 1 题的方向选项是：考研 / 就业 / 考公 / 留学 / 创业 / 还没想好
 *   但案例表里实际只有：考研(3) / 就业(3) / 保研(1) / 考公(1) / 留学(2)
 *
 *   两处对不上 —— 问卷里选不到"保研"，但案例里有保研；
 *   问卷里能选"创业"，但案例里一条都没有。
 *   所以这里做了两件事兜底：
 *     ① 筛选标签不是写死的，而是【从实际数据里生成】，
 *        这样永远不会出现"点了个标签结果什么都没有"的尴尬。
 *     ② 万一是通过别的方式筛到了空方向（比如从问卷带过来的"创业"），
 *        自动放宽为"展示其他方向的案例"，页面不会空着。
 * ------------------------------------------------------------------
 */

/** 案例列表页的字段（对应接口文档 3.4 节返回的 list 元素） */
export const CASE_FIELDS = [
  'id',
  'title',
  'direction',
  'school_level',
  'major_type',
  'grade',
  'score_level',
  'summary',
  'experience',
  'result',
]

/**
 * 离线案例库。与 backend/init.sql 第 10 步的 10 条 INSERT 保持一致。
 * 字段名刻意与接口返回一致，这样"接口来的案例"和"本地案例"是同一个形状，
 * 页面代码只要写一套。
 */
export const FALLBACK_CASES = [
  // ---------- 考研 3 条 ----------
  {
    id: 1,
    title: '双非计算机大三考研上岸 211',
    direction: '考研',
    school_level: '普通一本',
    major_type: '理工类',
    grade: '大三',
    score_level: '前30%',
    summary: '大三上定校，暑假强化刷题，12月一战上岸。',
    experience:
      '最大的坑是数学开始太晚，大三下才正式复习，暑假一度跟不上进度。建议数学最晚大三上就开始。',
    result: '已上岸某 211 计算机专硕',
  },
  {
    id: 2,
    title: '211 文科跨专业考研，10 个月一战上岸名校',
    direction: '考研',
    school_level: '985/211',
    major_type: '文史类',
    grade: '大三',
    score_level: '中等',
    summary: '大三下 3 月启动，通读 8 本参考书，暑假定框架，12 月上岸。',
    experience:
      '只背书不练输出等于无效——答题批改一度 30 分只得 15 分。模拟考排名靠后不代表最终结果。\n英语跟风选错老师浪费两个月，换背诵方式后效率大增。',
    result: '总分 409，初试第三、综合第二，上岸某师范类名校',
  },
  {
    id: 3,
    title: '211 经管类考研，9 月临阵换校成功上岸',
    direction: '考研',
    school_level: '985/211',
    major_type: '经管类',
    grade: '大三',
    score_level: '中等',
    summary: '原定 985 目标，8 月底专业课崩盘，9 月果断换校，最终 426 分上岸。',
    experience:
      '择校过于保守，9 月才临时换校。政治肖八只考 20 多分一度崩溃，靠死磕肖四逆袭到 80 分。\n经管类择校原则：城市 > 学校 > 专业。9 月是换校关键窗口。',
    result: '总分 426，上岸某 211 金融专硕',
  },

  // ---------- 就业 3 条 ----------
  {
    id: 4,
    title: '二本经管类大四秋招进银行',
    direction: '就业',
    school_level: '二本',
    major_type: '经管类',
    grade: '大四',
    score_level: '中等',
    summary: '大三暑假实习，大四秋招投递 60 家，最终拿到城商行 offer。',
    experience:
      '简历上没实习经历是最致命的。大三暑假一定要去实习，哪怕不给钱。银行笔试的行测题要提前一个月刷。',
    result: '已签约某城商行管培生',
  },
  {
    id: 5,
    title: '二本会计学秋招银行笔面全流程',
    direction: '就业',
    school_level: '二本',
    major_type: '经管类',
    grade: '大三',
    score_level: '中等',
    summary: '大三暑假银行实习定向，大四秋招投 6 家国有行，5 家进面。',
    experience:
      '银行秋招 8 月起陆续网申，建议列一张表记录每家报名截止/笔试/面试时间。\n简历最好直接用银行官方模板，否则容易初筛被刷。四大行校招多要求签 3-5 年柜员岗。',
    result: '拿到 2 个 offer，最终选交行营销岗',
  },
  {
    id: 6,
    title: '二本师范类考教师编，提前批一次上岸',
    direction: '就业',
    school_level: '二本',
    major_type: '文史类',
    grade: '大四',
    score_level: '前30%',
    summary: '目标明确锁定教师编，笔试刷题 + 面试把 10 篇篇目每篇讲近 10 遍。',
    experience:
      '面试现场仅给 10 分钟准备完全不够，必须提前练到形成肌肉记忆。\n导入语/结束语/板书不能简写，小学板书不能连笔或笔顺错误。笔试占 40%、面试占 60%。',
    result: '上岸市属附属小学教师编',
  },

  // ---------- 保研 1 条 ----------
  {
    id: 7,
    title: '211 从农学转经济统计，保研上岸财经名校',
    direction: '保研',
    school_level: '985/211',
    major_type: '经管类',
    grade: '大一',
    score_level: '前10%',
    summary: '大一提绩点，大二转专业，大三拿下数模国二，预推免上岸。',
    experience:
      '夏令营海投但非第一名结果惨淡，大佬手里握着多个 offer。\n部分院校只有预推免或只有夏令营，必须自己搜集信息。预推免 9 月下旬面试密集易撞车。',
    result: '上岸某财经类名校应用统计专硕',
  },

  // ---------- 考公 1 条 ----------
  {
    id: 8,
    title: '985 冷门专业转码进大厂，在职 3 个月考上公务员',
    direction: '考公',
    school_level: '985/211',
    major_type: '理工类',
    grade: '大四',
    score_level: '中等',
    summary: '大厂 996 一年后决心备考，在职利用所有碎片时间，3 个月一次上岸。',
    experience:
      '在职备考关键是把碎片时间用尽——地铁、午休都用来刷题。\n体制内外每月能存下的钱其实差不多，但换回了健康和生活。找到 2 位引路朋友带入备考氛围很重要。',
    result: '上岸一线城市公务员，965 基本不加班',
  },

  // ---------- 留学 2 条 ----------
  {
    id: 9,
    title: '985 医学生 DIY 申请，上岸新加坡国立 PhD',
    direction: '留学',
    school_level: '985/211',
    major_type: '医学类',
    grade: '大三',
    score_level: '前30%',
    summary: '三段校外科研 + 一段校内科研，全程 DIY，拿到 NUS 等 5 个 offer。',
    experience:
      '语言考试宜利用假期集中培训 1 个多月后立即考，托福硬学考了 5 次效率极差。\nPhD 申请不宜找中介，学术性强、商业化服务帮不上忙。兴趣是"获得"的，需要深耕才能找到。',
    result: '获 NUS、杜兰、港中文等 PhD offer，最终去新加坡国立大学',
  },
  {
    id: 10,
    title: '双一流材料系 3+2 项目，申到常春藤 PhD',
    direction: '留学',
    school_level: '985/211',
    major_type: '理工类',
    grade: '大二',
    score_level: '前10%',
    summary: '大二参加 3+2 联合培养项目，海外期间发两篇一作，套磁转申 PhD。',
    experience:
      '申请维度重要度：推荐信 > 科研成果 > GPA > 语言 > GRE。\n本科一作（即使影响因子低）比非一作高影响因子更有说服力。选校时优先匹配导师研究方向，而非学校排名。',
    result: '录取某常春藤盟校机械工程 PhD',
  },
]

/** "全部"这个标签的取值。空字符串也算全部，方便直接把问卷方向传进来 */
export const ALL_DIRECTIONS = '全部'

/**
 * 方向标签的展示顺序。
 *
 * 为什么不直接用问卷的选项？因为问卷里没有"保研"，硬套会导致
 * 那一条保研案例永远筛不出来。这里按"考研/保研 → 就业 → 考公 → 留学"
 * 的逻辑排，把实际存在但问卷里没有的方向（保研）也放进来。
 * 真正显示哪几个标签，由 buildDirectionTabs() 按数据实际情况决定。
 */
const DIRECTION_ORDER = ['考研', '保研', '就业', '考公', '留学', '创业', '其他']

/**
 * 生成筛选标签：只用【数据里真的存在】的方向，
 * 顺序按 DIRECTION_ORDER 排。这样永远不会点出一个空标签。
 */
export function buildDirectionTabs(list) {
  const present = new Set((list || FALLBACK_CASES).map((c) => c.direction))
  const ordered = DIRECTION_ORDER.filter((d) => present.has(d))
  // 保底：数据里出现了没登记在 DIRECTION_ORDER 里的方向，也加在末尾，不能丢
  const rest = [...present].filter((d) => !DIRECTION_ORDER.includes(d)).sort()
  return [ALL_DIRECTIONS, ...ordered, ...rest]
}

/** 年级的先后顺序，用来判断"和我年级相近" */
const GRADE_ORDER = ['大一', '大二', '大三', '大四', '研究生']

/**
 * 按"和我的年级接近程度"排序：同年级最靠前，其次差 1 个年级，以此类推。
 * 传了年级才排；没传就保持原顺序（原顺序已经是按方向分组的）。
 */
function sortByGrade(list, grade) {
  const mine = GRADE_ORDER.indexOf(grade)
  if (mine < 0) return list
  return list
    .map((c, i) => {
      const his = GRADE_ORDER.indexOf(c.grade)
      // 数据里年级为空或写了个没登记的值的，排到最后，但不丢掉
      const dist = his < 0 ? 99 : Math.abs(his - mine)
      return { c, dist, i }
    })
    .sort((a, b) => (a.dist - b.dist) || (a.i - b.i))
    .map((x) => x.c)
}

/**
 * 挑选要展示的案例 —— 这是本地版的"匹配逻辑"，与接口文档 3.4 节
 * 写的规则一致，保证"接口通了"和"接口没通"两条路的结果长得一样：
 *
 *   1. 先按 direction 精确匹配
 *   2. 再按 grade 相近排序（同一个年级排前面）
 *   3. 取前 limit 条
 *   4. 没有完全匹配的 → 放宽为"展示其他方向"，宁可给相近的，也不要给空白页
 *
 * 返回值比接口多两个字段，都是给页面做提示用的：
 *   relaxed   —— true 表示"这个方向没有案例，展示的是其他方向"
 *   synced    —— 这一份是本地数据还是服务器数据
 */
export function pickCases({ direction, grade, limit = 6 } = {}, source) {
  const all = source && source.length ? source : FALLBACK_CASES
  const wantDirection = direction && direction !== ALL_DIRECTIONS

  const matched = wantDirection ? all.filter((c) => c.direction === direction) : all
  const relaxed = wantDirection && matched.length === 0
  const pool = relaxed ? all : matched

  const sorted = sortByGrade(pool.slice(), grade)
  const list = sorted.slice(0, limit)
  return { list, total: list.length, relaxed, direction: wantDirection ? direction : '' }
}

/**
 * 判断这一批案例是不是【被放宽过的】—— 请求了某个方向，但返回的列表里
 * 一条这个方向的都没有，说明实际上展示的是别方向的案例。
 *
 * 为什么要单独抽成一个函数、而不是在接口层写一行？
 *   因为这个判断有两个来源，必须合起来用：
 *     ① 后端返回的 relaxed 字段（如果后端有返回的话）
 *     ② 前端自己按返回数据算
 *
 *   只信 ①：万一后端某天不返回这个字段（注意 C 的接口文档 3.4 节里
 *   确实【没有】定义 relaxed，是后端自己加的），前端就会把"别方向的案例"
 *   说成"「创业」的案例" —— 等于骗用户，这是最不能接受的一种错误。
 *   只算 ②：等于完全无视后端，也不好。
 *   所以：后端给了明确的布尔值就用后端的，其余一律自己算。
 *
 * @param {Array}  list        接口/本地返回的案例数组
 * @param {String} direction   本次请求的方向（'' 或 '全部' 表示没筛方向）
 * @param {*}      serverValue 后端返回的 relaxed，可能 undefined / null / 非布尔
 * @returns {Boolean}
 */
export function isRelaxed(list, direction, serverValue) {
  // 后端给了明确答案就以后端为准
  if (typeof serverValue === 'boolean') return serverValue
  // 没筛方向（「全部」）就不存在"放宽"这回事
  if (!direction || direction === ALL_DIRECTIONS) return false
  const arr = list || []
  // 空列表不算"放宽"，那是"一条都没有"，由调用方走另一条兜底逻辑
  return arr.length > 0 && !arr.some((c) => c.direction === direction)
}

/** 案例卡片上的"人物画像"标签：学校层次 / 专业类型 / 起始年级 / 成绩水平 */
export function profileTags(item) {
  return [item.school_level, item.major_type, item.grade, item.score_level]
    .map((x) => (x || '').trim())
    .filter(Boolean)
}
