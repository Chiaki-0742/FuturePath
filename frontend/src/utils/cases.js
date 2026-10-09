/**
 * 案例的离线数据与筛选规则。
 *
 * ------------------------------------------------------------------
 * 数据以谁为准？
 *
 *   以【后端数据库】为准 —— 案例存在 `cases` 表里（C 的 init.sql 第 10 步，
 *   共 18 条，6 个方向各 3 条），前端通过 `GET /api/cases` 拿。
 *
 *   下面这份 FALLBACK_CASES 是"离线版"，用途只有一个：
 *   后端还没起来、或者接口还没写好时，案例列表页照样能打开、能演示。
 *   它的内容与 init.sql 里那 18 条 INSERT 【一字不差】——
 *   两边一旦不一致，联调时会出现"列表里有、点进去没有"这种最难查的问题。
 *
 *   ⚠️ 改数据请改 `backend/init.sql`，然后重跑
 *      `<工作区>/tools/gen-fallback-data.py` 自动同步到这里。
 *      不要手写 —— 18 条案例 + 97 条步骤，手抄必错。
 * ------------------------------------------------------------------
 *
 * 曾经有一个【问卷方向和案例对不上】的问题，C 在 2026-10-01 已修复：
 *
 *   修之前：问卷里选不到"保研"（但案例表有 1 条），
 *           问卷里能选"创业"（但案例表 0 条）。
 *   修之后：问卷 A 组加了「保研」，案例扩到 18 条、6 个方向各 3 条。
 *
 *   页面上的两层兜底【保留着】，因为它们是"数据出问题时不至于白页"的保险，
 *   而不是专门为那一个 bug 写的：
 *     ① 筛选标签不是写死的，而是【从实际数据里生成】，
 *        这样永远不会出现"点了个标签结果什么都没有"的尴尬。
 *     ② 万一还是筛到了空方向，自动放宽为"展示其他方向的案例"，页面不会空着。
 *
 *   另：「还没想好」是个特例 —— 它不是"数据缺失"，而是用户还没定方向。
 *   C 明确说不给它配案例（硬塞等于替用户做选择）。它会走到后端的
 *   第 3 层兜底（返回通用案例 + relaxed = true），页面会说明情况。
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
 * 离线案例库。与 backend/init.sql 第 10 步的 18 条 INSERT 保持一致
 * （由 tools/gen-fallback-data.py 从 init.sql 自动生成，别手改）。
 * 字段名刻意与接口返回一致，这样"接口来的案例"和"本地案例"是同一个形状，
 * 页面代码只要写一套。
 *
 * ⚠️ id 必须与数据库一致（这里是 1-18，按 init.sql 的 INSERT 顺序）。
 *    详情页靠 id 去 FALLBACK_STEPS 取步骤，错位了就会"点进去看到别人案例的时间线"。
 */
export const FALLBACK_CASES = [
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
  {
    id: 4,
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
  {
    id: 5,
    title: '211 食品质量与安全保研上岸 985',
    direction: '保研',
    school_level: '985/211',
    major_type: '理工类',
    grade: '大一',
    score_level: '前10%',
    summary: '大一开始刷绩点，大二进实验室做科研，大三夏令营入营多所 985。',
    experience:
      '保研看的是"三年成绩 + 科研 + 竞赛"的综合排名，大一就得开始算绩点，越晚越被动。\n夏令营入营门槛逐年提高，没有一段像样的科研经历很难进好学校的营。',
    result: '上岸某 985 食品科学与工程学硕',
  },
  {
    id: 6,
    title: '双非法学保研上岸 985，绩点提升方法论',
    direction: '保研',
    school_level: '普通一本',
    major_type: '文史类',
    grade: '大二',
    score_level: '前30%',
    summary: '大二从中等成绩开始冲刺，靠"选课策略 + 每门课吃透"把绩点拉到专业前列。',
    experience:
      '提升绩点的关键不是熬夜，而是选课策略：优先选给分稳、考核方式偏好自己的课。\n专业课要吃透老师的研究方向，答题往他的思路上靠，分数往往更高。',
    result: '上岸某 985 法学学硕',
  },
  {
    id: 7,
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
    id: 8,
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
    id: 9,
    title: '研究生学历转行进大厂，靠项目经历补短板',
    direction: '就业',
    school_level: '985/211',
    major_type: '理工类',
    grade: '研究生',
    score_level: '前30%',
    summary: '研究生阶段专注一个纵向课题，把成果沉淀成可讲的项目故事，秋招拿到大厂 offer。',
    experience:
      '研究生找工作和本科生最大的区别：简历上要有"能讲 20 分钟"的深度项目。\n不要把论文标题直接写进简历，要改写成"解决了什么问题、用了什么方案、达到什么指标"。',
    result: '入职某互联网大厂算法岗',
  },
  {
    id: 10,
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
  {
    id: 11,
    title: '二本应届生考公，从大三下开始一年上岸县城',
    direction: '考公',
    school_level: '二本',
    major_type: '文史类',
    grade: '大三',
    score_level: '中等',
    summary: '大三下确定考公目标，行测申论同步推进，省考一次上岸。',
    experience:
      '行测是拉分项，资料分析必须每天限时刷，数量关系果断放弃部分难题。\n申论不要只顾背模板，要动笔写，写 30 篇以上才有手感。选岗比分数更重要，避开千人岗。',
    result: '上岸某县城综合管理岗',
  },
  {
    id: 12,
    title: '研究生考选调生，用学历换基层起点',
    direction: '考公',
    school_level: '985/211',
    major_type: '经管类',
    grade: '研究生',
    score_level: '前10%',
    summary: '研究生期间准备定向选调，笔试面试两手抓，一次上岸省会城市岗位。',
    experience:
      '选调生的报名门槛卡得很细：学校层次、党员身份、学生干部经历要提前核对。\n定向选调笔试难度低于省考，但面试更看重逻辑表达和对政策的理解，要提前练结构化面试。',
    result: '上岸省会城市定向选调生',
  },
  {
    id: 13,
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
    id: 14,
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
  {
    id: 15,
    title: '研究生毕业申海外全奖，绕过语言短板拿下 offer',
    direction: '留学',
    school_level: '普通一本',
    major_type: '理工类',
    grade: '研究生',
    score_level: '中等',
    summary: '研究生期间发 2 篇 SCI，语言成绩一般但靠科研硬实力申到海外全奖博士。',
    experience:
      '语言不是唯一门槛，科研产出能一定程度对冲语言短板，但要提前和目标导师套磁。\n英国、澳洲、欧洲部分院校对语言要求更灵活，可以优先投。申 PhD 时"导师愿不愿意招你"比学校排名更重要。',
    result: '获欧洲某高校全奖博士 offer',
  },
  {
    id: 16,
    title: '大二做校园二手交易平台，从宿舍做到覆盖三所高校',
    direction: '创业',
    school_level: '普通一本',
    major_type: '经管类',
    grade: '大二',
    score_level: '中等',
    summary: '大二从微信社群起步做二手交易，半年内扩展到三所高校，注册用户破万。',
    experience:
      '校园创业最大的坑是"先做产品再找需求"。我们一开始开发了 App，没人用；后来改回微信群，反而爆发了。\n学校创业扶持政策要去努力争取：场地免费、导师指导、部分项目还有启动资金。',
    result: '注册用户 1.2 万，获校级创业大赛一等奖',
  },
  {
    id: 17,
    title: '大三做考研辅导内容账号，毕业前跑通变现',
    direction: '创业',
    school_level: '985/211',
    major_type: '文史类',
    grade: '大三',
    score_level: '前30%',
    summary: '大三开始做考研经验分享账号，两年积累粉丝，毕业后成立小工作室。',
    experience:
      '内容创业前期最难的是坚持——前 3 个月几乎没有反馈，很多东西是"发到第 100 篇才开始涨粉"。\n不要一上来就想着变现，先把内容做到能被人主动转发。红线：别抄别人的稿，账号做起来后抄袭会被反噬。',
    result: '账号粉丝 8 万，毕业时已能稳定覆盖团队开支',
  },
  {
    id: 18,
    title: '研究生带团队做 AI 工具创业，从实验室项目到融资',
    direction: '创业',
    school_level: '985/211',
    major_type: '理工类',
    grade: '研究生',
    score_level: '前10%',
    summary: '研究生课题做出一个可落地的 AI 小工具，联合两位同学注册公司并拿到天使轮。',
    experience:
      '从实验室成果到产品之间隔着巨大的鸿沟，要找到愿意付费的真实用户，而不是自嗨。\n股权结构和分工要在早期就白纸黑字写清楚，很多学生团队是"技术一起做、钱不知道怎么分"散掉的。\n学生创业时间成本极高，要提前想清楚：是做成了继续，还是失败了直接秋招。',
    result: '公司获天使轮融资，团队 6 人',
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
  // ⚠️「没筛方向」这一条必须在最前面，要盖过后端返回的 relaxed。
  //
  // 原因是实测出来的（2026-10-09）：用户点「全部」时前端会把 direction
  // 传成「全部」这个字面量，后端找不到这个方向，走到它自己的第 3 层兜底
  // （返回全表 + relaxed = true）。但那个 true 的含义是"后端放宽了"，
  // 不是"这批案例跟你要的方向不一致" —— 用户压根没要方向。
  // 照搬后端的话，页面上会冒出一句「「全部」方向暂时还没有收录案例」，读不通。
  if (!direction || direction === ALL_DIRECTIONS) return false
  // 后端给了明确答案就以后端为准
  if (typeof serverValue === 'boolean') return serverValue
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

// ===========================================================================
//  案例详情（10/04 · 时间线 / 关键节点 / 经验教训）
// ===========================================================================

/**
 * 离线步骤库。键 = 案例 id，值 = 该案例的时间线。
 *
 * ⚠️ 与 backend/init.sql 的 case_steps INSERT 【一字不差】（共 97 条），
 *    由 tools/gen-fallback-data.py 从 init.sql 自动生成，别手改。
 *    正文里那些 ★ 符号是原作者的强调，不是排版失误，照抄不改。
 *
 * 为什么要在这里抄一份？
 *   和后端没起时列表页照样能开是一个道理：详情页要是"点进去一片空白"，
 *   演示时比列表页空白更难解释。但它的定位始终是【离线兜底】，
 *   接口通了就以接口为准。
 *
 * is_key = 1 → 关键节点（报名、考试、换校这类"错过就来不及"的时间点）。
 * 详情页会把它们用不同颜色和角标标出来。
 */
export const FALLBACK_STEPS = {
  1: [
    { phase: '大三上', content: '确定目标院校和专业，收集历年分数线、报录比；开始数学一轮复习', is_key: 1, order_no: 1 },
    { phase: '大三上', content: '英语单词每天 50 个，不中断', is_key: 0, order_no: 2 },
    { phase: '大三下', content: '数学二轮强化；专业课教材过一遍并做笔记', is_key: 0, order_no: 3 },
    { phase: '大三下', content: '英语开始做真题阅读，一周 2 套', is_key: 0, order_no: 4 },
    { phase: '暑假', content: '数学刷 1000 题；专业课背诵第一轮；英语真题精读', is_key: 1, order_no: 5 },
    { phase: '大四上', content: '政治冲刺；各科真题模拟；调整作息到考试节奏', is_key: 0, order_no: 6 },
    { phase: '9月-10月', content: '关注研招网，9 月预报名、10 月正式报名（错过就只能等明年）', is_key: 1, order_no: 7 },
    { phase: '12月', content: '打印准考证，提前踩点考场，参加初试', is_key: 1, order_no: 8 },
  ],
  2: [
    { phase: '大二下-大三上', content: '判断保研无望，决定考研；进课题组做课题，拿到科研项目参与证明', is_key: 0, order_no: 1 },
    { phase: '大三下（3月）', content: '专业课第一轮，通读 8 本参考书（10-15 天/本），配套网课', is_key: 1, order_no: 2 },
    { phase: '大三下暑假', content: '第二遍读书 + 整理知识框架', is_key: 0, order_no: 3 },
    { phase: '8月', content: '进入背书 + 输出的黄金期', is_key: 0, order_no: 4 },
    { phase: '10月', content: '第二轮背书 + 补充学科热点', is_key: 0, order_no: 5 },
    { phase: '11月', content: '开始模拟考，重点训练时间分配', is_key: 1, order_no: 6 },
    { phase: '12月底', content: '参加初试（次年 2 月出分）', is_key: 1, order_no: 7 },
  ],
  3: [
    { phase: '大三下-9月前', content: '以某 985 为目标复习，主攻数学和专业课', is_key: 0, order_no: 1 },
    { phase: '8月底', content: '专业课复习差距明显，心态出现波动', is_key: 0, order_no: 2 },
    { phase: '9月', content: '★ 及时更换目标院校为 211（9 月是换校关键窗口）', is_key: 1, order_no: 3 },
    { phase: '10月之后', content: '主攻政治肖八肖四 + 时政', is_key: 0, order_no: 4 },
    { phase: '11月', content: '开始隔天练翻译；后期整卷训练英语', is_key: 0, order_no: 5 },
    { phase: '12月', content: '考前一周重做肖八肖四，进入考试节奏', is_key: 1, order_no: 6 },
  ],
  4: [
    { phase: '大一', content: '就读农学，重心放在提绩点和参加活动上', is_key: 1, order_no: 1 },
    { phase: '大二', content: '★ 转入经济统计学专业；参加人口普查、信息素养大赛', is_key: 1, order_no: 2 },
    { phase: '大二升大三暑假', content: '组队备战全国大学生数学建模竞赛', is_key: 0, order_no: 3 },
    { phase: '大三开学', content: '获数模国赛国二等；明确"绩点 + 竞赛"可冲保研', is_key: 1, order_no: 4 },
    { phase: '大三下（5-7月）', content: '夏令营海投（简历/个人陈述/推荐信/参营论文要提前备好）', is_key: 1, order_no: 5 },
    { phase: '9月', content: '预推免用"综合第一"排名投递（注意面试撞车）', is_key: 1, order_no: 6 },
  ],
  5: [
    { phase: '大一', content: '★ 保研从大一开始：每门课都按"要拿 90+"的标准对待', is_key: 1, order_no: 1 },
    { phase: '大二', content: '进实验室跟老师做课题，争取挂名参与一项科研项目', is_key: 1, order_no: 2 },
    { phase: '大二-大三', content: '参加学科竞赛或大创项目，竞赛获奖是保研的重要加分项', is_key: 0, order_no: 3 },
    { phase: '大三上', content: '算清自己的专业排名和综合排名，确定能冲哪些学校', is_key: 1, order_no: 4 },
    { phase: '大三下（5-7月）', content: '投夏令营：海投 + 精准投结合，注意各校材料截止时间不同', is_key: 1, order_no: 5 },
    { phase: '9月', content: '预推免补投；拿到 offer 后再填志愿', is_key: 1, order_no: 6 },
  ],
  6: [
    { phase: '大二上', content: '发现成绩只有专业中游，决定用"选课 + 吃透考核方式"拉绩点', is_key: 1, order_no: 1 },
    { phase: '大二-大三', content: '优先选修给分稳、考核方式适合发挥的课程，避免"硬碰硬"', is_key: 1, order_no: 2 },
    { phase: '平时', content: '研究每位老师的出题偏好，答题往他的研究方向靠', is_key: 0, order_no: 3 },
    { phase: '大三下', content: '绩点冲进专业前列，开始准备夏令营材料', is_key: 1, order_no: 4 },
    { phase: '大三下-9月', content: '夏令营 + 预推免双线投递，广泛搜集信息', is_key: 0, order_no: 5 },
  ],
  7: [
    { phase: '大三下', content: '开始准备简历；了解银行招聘流程和时间线', is_key: 0, order_no: 1 },
    { phase: '大三暑假', content: '争取银行或相关行业实习（实习经历是简历的敲门砖）', is_key: 1, order_no: 2 },
    { phase: '大四上 9-10月', content: '秋招主战场：网申、笔试、面试同步进行', is_key: 1, order_no: 3 },
    { phase: '大四上', content: '提前一个月刷行测题，银行笔试必考', is_key: 0, order_no: 4 },
    { phase: '大四上 11-12月', content: '面试复盘，多投多练；拿到 offer 后及时签约', is_key: 0, order_no: 5 },
  ],
  8: [
    { phase: '大三暑假', content: '在银行营业部实习理财岗、大堂服务岗，确定就业方向', is_key: 1, order_no: 1 },
    { phase: '大四上 8月起', content: '关注秋招网申，投 6 家国有行 + 部分股份行', is_key: 1, order_no: 2 },
    { phase: '9-11月', content: '密集参加笔试和面试（5 家通过笔试进面）', is_key: 0, order_no: 3 },
    { phase: '11-12月', content: '对比 offer 条款（岗位、地点、服务年限）后签约', is_key: 1, order_no: 4 },
  ],
  9: [
    { phase: '研一', content: '尽早确定研究方向，主动找导师谈课题和产出目标', is_key: 1, order_no: 1 },
    { phase: '研一-研二', content: '专注一个纵向课题做到能讲清楚"为什么做 / 怎么做 / 结果如何"', is_key: 1, order_no: 2 },
    { phase: '研二', content: '把科研或实习项目包装成简历上的"项目经历"，量化指标', is_key: 1, order_no: 3 },
    { phase: '研二暑假', content: '争取大厂暑期实习（暑期实习是转正和秋招的最大入口）', is_key: 1, order_no: 4 },
    { phase: '研三秋招', content: '提前批 7-8 月启动，边实习边投递，拿到 offer 后谈薪资', is_key: 0, order_no: 5 },
  ],
  10: [
    { phase: '大三上', content: '自学编程，确定走互联网技术路线', is_key: 0, order_no: 1 },
    { phase: '大四春招', content: '进入大厂实习并转正', is_key: 0, order_no: 2 },
    { phase: '工作 1 年后', content: '经历项目被砍、同事被优化，决心考公', is_key: 1, order_no: 3 },
    { phase: '在职备考 3 个月', content: '利用地铁、午休等所有碎片时间刷题，一次上岸', is_key: 1, order_no: 4 },
    { phase: '考前', content: '找到 2 位引路朋友带入备考氛围', is_key: 0, order_no: 5 },
  ],
  11: [
    { phase: '大三下', content: '确定考公目标；查省考公告，明确自己专业能报的岗位', is_key: 1, order_no: 1 },
    { phase: '大三下-暑假', content: '行测打基础：分模块刷题，资料分析每天限时练', is_key: 1, order_no: 2 },
    { phase: '大四上', content: '申论开始动笔写，每周至少 2 篇，写够 30 篇才有手感', is_key: 0, order_no: 3 },
    { phase: '报名前', content: '★ 选岗比分数更重要——避开千人岗，优先"限制条件多"的岗位', is_key: 1, order_no: 4 },
    { phase: '考前 1 个月', content: '按考试时间做套卷，训练做题顺序和时间分配', is_key: 1, order_no: 5 },
  ],
  12: [
    { phase: '研一', content: '提前核对选调门槛：学校层次、党员身份、学生干部经历', is_key: 1, order_no: 1 },
    { phase: '研一-研二', content: '担任学生干部 / 争取入党，把报名硬条件补齐', is_key: 1, order_no: 2 },
    { phase: '研三上', content: '定向选调报名，同时准备笔试（行测+申论）和结构化面试', is_key: 1, order_no: 3 },
    { phase: '面试前', content: '练结构化面试：政策理解题要能讲出自己的观点和逻辑', is_key: 1, order_no: 4 },
    { phase: '政审体检', content: '注意档案、征信、体检等环节，别在最后一步翻车', is_key: 0, order_no: 5 },
  ],
  13: [
    { phase: '大一-大三', content: '跨数学/机械/生物/医学多门课程，换过多个实验室找方向', is_key: 0, order_no: 1 },
    { phase: '大三', content: '选定生物医学科学方向，进医学院课题组做独立研究', is_key: 1, order_no: 2 },
    { phase: '大二下-申请季', content: '备考托福（建议假期集中培训 1 个多月后立即考）', is_key: 1, order_no: 3 },
    { phase: '申请季', content: 'DIY 撰写文书和研究计划，联系推荐人', is_key: 0, order_no: 4 },
    { phase: '次年 3-4月', content: '收到多校 offer，综合导师方向和资源后确定去向', is_key: 1, order_no: 5 },
  ],
  14: [
    { phase: '大二-大三', content: '参加 3+2 联合培养项目，提前适应海外学习科研', is_key: 1, order_no: 1 },
    { phase: '海外期间', content: '做独立科研，发表一篇期刊一作、一篇会议一作', is_key: 1, order_no: 2 },
    { phase: '申请季前', content: '暑研/学期交流期间争取拿到国外推荐信', is_key: 1, order_no: 3 },
    { phase: '申请季', content: '套磁导师 + 文书，按"导师方向匹配"选校', is_key: 0, order_no: 4 },
    { phase: '次年 2-4月', content: '收到 offer，在 UCLA、Duke、康奈尔中选择', is_key: 1, order_no: 5 },
  ],
  15: [
    { phase: '研一', content: '确定要出国读博后，把研究方向往目标导师的领域靠', is_key: 1, order_no: 1 },
    { phase: '研一-研二', content: '集中精力做科研产出：争取发 2 篇以上 SCI/EI 论文', is_key: 1, order_no: 2 },
    { phase: '研二', content: '梳理目标国家/院校的语言要求，选要求相对灵活的学校', is_key: 0, order_no: 3 },
    { phase: '研三上', content: '★ 提前 6-12 个月套磁导师，附上简历和论文', is_key: 1, order_no: 4 },
    { phase: '申请季', content: '准备文书、推荐信，同步申请奖学金', is_key: 0, order_no: 5 },
  ],
  16: [
    { phase: '大一-大二', content: '观察校园里的真实痛点，先用微信群小范围验证需求', is_key: 1, order_no: 1 },
    { phase: '大二', content: '★ 放弃了"先开发 App"的想法，改回社群运营，用户量反而爆发', is_key: 1, order_no: 2 },
    { phase: '大二', content: '申请学校创业扶持：免费场地、创业导师、部分项目有启动资金', is_key: 1, order_no: 3 },
    { phase: '大二下', content: '扩展到周边两所高校，建立校园代理网络', is_key: 0, order_no: 4 },
    { phase: '大三', content: '报名校级/省级创业大赛，以赛促建、拿资源和曝光', is_key: 0, order_no: 5 },
  ],
  17: [
    { phase: '大三上', content: '开始做考研经验分享账号，固定更新频率', is_key: 0, order_no: 1 },
    { phase: '大三-大四', content: '坚持更新（前 3 个月几乎没反馈，属于正常现象）', is_key: 1, order_no: 2 },
    { phase: '大四', content: '把内容沉淀成方法论专栏，形成差异化', is_key: 0, order_no: 3 },
    { phase: '毕业前', content: '跑通变现路径：课程 / 咨询 / 社群，成立小工作室', is_key: 1, order_no: 4 },
    { phase: '长期', content: '⚠️ 红线：内容必须原创，抄稿做起来后会被反噬', is_key: 1, order_no: 5 },
  ],
  18: [
    { phase: '研一', content: '在课题中做出可落地的技术原型，判断是否有商业化可能', is_key: 0, order_no: 1 },
    { phase: '研一-研二', content: '★ 找到愿意付费的真实用户，而不是自嗨式做产品', is_key: 1, order_no: 2 },
    { phase: '研二', content: '组建核心团队，提前用白纸黑字写清股权结构和分工', is_key: 1, order_no: 3 },
    { phase: '研二-研三', content: '注册公司，接触校内孵化器和早期投资人', is_key: 1, order_no: 4 },
    { phase: '研三', content: '想清楚退路：项目继续还是转秋招，两头都要有准备', is_key: 1, order_no: 5 },
  ],
}

/** 从离线库按 id 找一条案例（找不到返回 null，调用方自己决定怎么提示） */
export function fallbackCase(id) {
  const n = Number(id)
  return FALLBACK_CASES.find((c) => Number(c.id) === n) || null
}

/** 从离线库按 id 取该案例的步骤（已按 order_no 排好序） */
export function fallbackSteps(id) {
  const list = FALLBACK_STEPS[Number(id)] || []
  return list.slice().sort((a, b) => a.order_no - b.order_no)
}

/**
 * 判断一个步骤是不是关键节点。
 *
 * 为什么要用一个函数、而不是直接写 `s.is_key === 1`？
 *   因为 is_key 从数据库一路过来，可能变成 1 / "1" / true 中的任何一种
 *   （SQLite 和 MySQL 的类型处理不一样，中间还可能过一遍 JSON）。
 *   前端只跟一个"是/否"打交道，转换的脏活集中在这里做，
 *   免得页面上到处写 `Number(x) === 1` 这种容易漏的写法。
 */
export function isKeyStep(step) {
  if (!step) return false
  const v = step.is_key
  return v === 1 || v === true || v === '1'
}

/** 从一组步骤里挑出关键节点（详情页顶部的"其中 N 个关键节点"要用） */
export function keySteps(steps) {
  return (steps || []).filter(isKeyStep)
}
