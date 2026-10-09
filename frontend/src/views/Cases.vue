<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchCases } from '@/api/cases'
import { useUserStore } from '@/stores/user'
import {
  ALL_DIRECTIONS,
  buildDirectionTabs,
  FALLBACK_CASES,
  profileTags,
} from '@/utils/cases'
import { surveyDirection, surveyGrade } from '@/utils/survey'

/**
 * 案例列表页（10/03 任务）。
 *
 * 交付标准是「按方向筛选能出结果」，所以这一页的重点有两处：
 *
 *   1. 筛选真的生效 —— 切一个方向，列表里剩下的全是那个方向的案例。
 *      这里的断言不能靠眼睛，自检脚本会真的去点标签、再读卡片上的方向文字。
 *
 *   2. 筛选【不会筛出空白页】—— 这是最容易忽略、但演示时最致命的一点。
 *      用户选了个冷门方向（案例表里一条都没有），如果直接显示"暂无数据"，
 *      看起来就像页面坏了。所以这里做了两级兜底：
 *        · 筛选标签本身是从数据里生成的，不会有"点了必然为空"的标签
 *        · 万一筛出来是空的（比如从问卷带过来一个没收录的方向），
 *          自动放宽为展示其他方向的案例，并在顶部说清楚
 *
 * 数据来源：优先 GET /api/cases（接口文档 3.4 节），
 * 接口没上线时自动回落到 utils/cases.js 的离线案例库（与 init.sql 一字不差）。
 */

const route = useRoute()
const userStore = useUserStore()

const loading = ref(false)
const error = ref('')

// 当前选中的方向
const direction = ref(ALL_DIRECTIONS)
// 从接口/本地拿回来的结果
const result = ref({ list: [], total: 0, relaxed: false, synced: true })

// 基础的筛选标签：从数据里生成，不是写死的，所以不会有"点了必然为空"的标签
const BASE_TABS = buildDirectionTabs(FALLBACK_CASES)

/**
 * 实际显示的标签 = 基础标签 + 当前选中的那个方向。
 *
 * 为什么要补这一段？考虑这个真实场景：
 *   用户在问卷里选了"创业"（问卷里确实有这个选项），
 *   但案例表里一条创业的案例都没有（这是个已知的数据不一致）。
 *   如果标签只从数据生成，用户进来会看到「全部」被选中，
 *   他选的方向仿佛被无声地丢掉了 —— 他会以为筛选没生效。
 *
 * 补上之后：他自己的方向会作为一个标签出现并被选中，
 * 同时页面上有一句说明解释"这个方向还没收录，先看看其他人的"。
 * 既不瞒着用户，也不会给他一个白页面。
 */
const tabs = computed(() => {
  const list = BASE_TABS.slice()
  const d = direction.value
  if (d && d !== ALL_DIRECTIONS && !list.includes(d)) list.push(d)
  return list
})

/**
 * 进页面时默认选哪个方向？
 *   ① 地址里带了 ?direction=xxx（比如从首页「看同方向的案例」点进来）
 *   ② 用户填过问卷 → 用他问卷里选的方向
 *   ③ 都没有 → 「全部」
 *
 * 注意这里【不】检查方向在不在基础标签里 —— 不在也要留着，
 * 让上面 tabs 把它补成一个标签，这样用户能知道"我们收到了你的方向，
 * 只是暂时没有这个方向的案例"。直接退回「全部」的话，
 * 用户会以为自己的选择被忽略了。
 *
 * 唯一的例外是"还没想好"：它是问卷里的一个选项，但不是一个真实方向，
 * 留着只会凭空多出一个空标签。
 */
function initialDirection() {
  const fromQuery = (route.query.direction || '').toString().trim()
  const fromSurvey = surveyDirection(userStore.userInfo?.username || '')
  const want = fromQuery || fromSurvey
  if (!want || want === '还没想好') return ALL_DIRECTIONS
  return want
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchCases({
      // 「全部」要【照原样】发出去，不能转成空串 —— 这条是实测踩出来的坑：
      //
      //   后端 case.py 里有一句 `if not direction and ans: direction = ans.direction`，
      //   意思是"你没告诉我方向，那我就用你问卷里的方向"。所以传空串过去，
      //   后端会兜底成"考研"，用户点「全部」实际上只看到考研那 3 条 ——
      //   而页面上没有任何提示，"全部"看起来就只有 3 条。
      //
      //   发「全部」两个字过去，后端的"方向+年级"和"仅方向"两层都匹配不到，
      //   自然落到第 3 层（返回全表），这才是用户点「全部」想要的结果。
      //   后端给的 relaxed = true 由 isRelaxed() 挡掉（用户没要方向，不存在放宽）。
      //
      // ⚠️ 这算前端在借后端的兜底实现自己的需求（后端没有"不筛方向"的正式约定）。
      //    已经反馈给后端，如果他加了正式参数（比如 all=1），这里换成那个。
      direction: direction.value,
      // ⚠️ 这里的年级必须用【问卷里填的】，不能用账号资料里的 user.grade。
      //    账号资料那个是注册时填的、之后不再变，一个人注册时填"大一"、
      //    现在读大三，用它去匹配等于拿一年前的信息找案例。
      //    后端 case.py 的"方向+年级"第一层匹配要的就是问卷年级，
      //    前端传错的值过去反而会把后端正确的兜底覆盖掉。
      //    问卷里没有（没填过/跳过了）就传空 —— 空值不发这个参数，
      //    后端会自动回落到它自己查到的问卷年级。
      grade: surveyGrade(userStore.userInfo?.username || ''),
      limit: 20,
    })
    result.value = data
  } catch (e) {
    error.value = e.message || '案例加载失败'
  } finally {
    loading.value = false
  }
}

/** 点筛选标签：已经在选中的那个就不重复请求了 */
function selectDirection(name) {
  if (name === direction.value) return
  direction.value = name
  load()
}

onMounted(async () => {
  // 没登录时顶栏没有用户资料，筛默认方向要靠它。先补一次（失败也无所谓）
  if (!userStore.userInfo) {
    await userStore.fetchInfo().catch(() => {})
  }
  direction.value = initialDirection()
  await load()
})

const cases = computed(() => result.value.list || [])
const isEmpty = computed(() => !loading.value && cases.value.length === 0)

/**
 * 用户问卷里选的是「还没想好」吗？
 *
 * 为什么要单独判断：这种人看到的是"全表案例"，和"选了个真实方向但
 * 一条案例都没有"落到同一段展示逻辑里，但意思完全不同 ——
 * 一个是"你还没定方向"，一个是"这个方向没收录"。
 * 不分开的话会显示成「「全部」方向暂时还没有收录案例」，
 * 因为 initialDirection() 把"还没想好"折成了"全部"。
 * 那句话既难懂又像是页面坏了（C 在数据变更说明里专门提过）。
 */
const isUndecided = computed(
  () => surveyDirection(userStore.userInfo?.username || '') === '还没想好'
)

/**
 * 顶部提示条该不该出现、出现哪一句。
 *
 *   ① 'undecided' —— 问卷里选的「还没想好」。这不是"方向没收录"，
 *      而是"你还没定方向"，所以话术是引导，不是解释。
 *      ⚠️ 必须同时要求"当前看的是全部"：用户就算问卷选了"还没想好"，
 *      后来点了「考研」标签，那就该按考研正常显示，别再念叨那句引导。
 *
 *   ② 'relaxed' —— 选了个真实方向，但这个方向确实没有案例，
 *      后端放宽成给别的方向了。要说明情况，免得用户以为筛错了。
 *
 * 注意 'undecided' 不能靠 result.relaxed 来判断：为了修"点「全部」只看得到
 * 自己方向那几条"的问题（见 load() 里的注释），「全部」会把 direction
 * 原样发给后端，而后端返回的 relaxed 已经被 isRelaxed() 挡掉了。
 */
const notice = computed(() => {
  if (isUndecided.value && direction.value === ALL_DIRECTIONS) return 'undecided'
  if (result.value.relaxed) return 'relaxed'
  return ''
})
</script>

<template>
  <div class="page">
    <h1 class="page__title">真实案例</h1>
    <p class="page__subtitle">
      和你情况相近的人是怎么走的 —— 看看他们的路线、踩过的坑
    </p>

    <!-- 筛选：切方向 -->
    <div class="filters" role="tablist" aria-label="按方向筛选">
      <button
        v-for="name in tabs"
        :key="name"
        class="filter"
        :class="{ 'filter--on': name === direction }"
        role="tab"
        :aria-selected="name === direction"
        @click="selectDirection(name)"
      >
        {{ name }}
      </button>
    </div>

    <div v-if="error" class="alert alert--error">
      {{ error }}
      <button class="btn btn--text" @click="load">重试</button>
    </div>

    <!-- 两种要说清楚的情况，话术不同（判断逻辑见上面 notice 的注释）：
         ① 还没想好方向 → 引导，不是解释
         ② 这个方向真没收录 → 解释清楚，并给其他人的路线 -->
    <div v-if="notice" class="alert alert--info">
      <template v-if="notice === 'undecided'">
        先看看大家的选择，再决定自己的路 —— 下面这些同学的情况各不相同，可以多翻几个
      </template>
      <template v-else>
        「{{ direction }}」方向暂时还没有收录案例，先看看其他方向的同学怎么走
      </template>
    </div>

    <!-- 接口还没上线时说明一下，免得以为看到的是真实数据库里的数据 -->
    <p v-if="!result.synced && !loading" class="source-note">
      案例接口还没上线，当前展示的是内置案例库（内容与数据库一致）
    </p>

    <div v-if="loading" class="card muted">正在加载案例…</div>

    <template v-else>
      <p class="count">
        共 {{ cases.length }} 条<template v-if="result.relaxed"><template
          v-if="isUndecided"
        >来自不同方向的案例</template><template v-else>其他方向的案例</template></template><template
          v-else-if="direction !== ALL_DIRECTIONS"
        >「{{ direction }}」的案例</template>
      </p>

      <div v-if="isEmpty" class="card">
        <h2 class="card__title">这里还没有案例</h2>
        <p class="card__hint">
          换一个方向看看，或者点上面的「全部」浏览所有同学的经历。
        </p>
        <button class="btn" @click="selectDirection(ALL_DIRECTIONS)">
          看看全部案例
        </button>
      </div>

      <div v-else class="cases">
        <!--
          整张卡片就是一个链接，点哪都能进详情。
          用 RouterLink 而不是"点标题才进"：卡片上写着"人物画像 + 概述 + 结果"，
          用户想点哪块是不确定的，让整块都可点是唯一不会让人困惑的做法。
        -->
        <RouterLink
          v-for="item in cases"
          :key="item.id"
          :to="{ name: 'case-detail', params: { id: item.id } }"
          class="case"
        >
          <div class="case__head">
            <h2 class="case__title">{{ item.title }}</h2>
            <span class="chip chip--direction">{{ item.direction }}</span>
          </div>

          <!-- 人物画像：这几个标签回答"这人跟我像不像" -->
          <ul class="profile">
            <li v-for="tag in profileTags(item)" :key="tag" class="chip">
              {{ tag }}
            </li>
          </ul>

          <p class="case__summary">{{ item.summary }}</p>

          <p v-if="item.result" class="case__result">
            <span class="case__result-label">结果</span>
            {{ item.result }}
          </p>

          <span class="case__more">查看完整路线 →</span>
        </RouterLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ---------------- 筛选 ---------------- */

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 22px;
}

.filter {
  padding: 8px 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.filter:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.filter--on {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.filter--on:hover {
  background: var(--primary-dark);
  border-color: var(--primary-dark);
  color: #fff;
}

/* ---------------- 列表 ---------------- */

.source-note {
  margin: -8px 0 16px;
  font-size: 12px;
  color: var(--text-3);
}

.count {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-2);
}

.cases {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.case {
  display: flex;
  flex-direction: column;
  padding: 22px;
  border: 1px solid #e9edf4;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(28, 36, 48, 0.03);
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
  /* 整张卡片是个 <a>，要把链接默认的蓝字和下划线去掉，
     否则卡片里每行文字都会变成"可点链接"的样子，很难看 */
  color: inherit;
  text-decoration: none;
}

.case:hover {
  color: inherit;
  text-decoration: none;
}

.case:hover {
  transform: translateY(-3px);
  border-color: #d5e0f7;
  box-shadow: 0 2px 6px rgba(28, 36, 48, 0.05),
    0 14px 30px -20px rgba(47, 107, 255, 0.6);
}

.case__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.case__title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  margin: 0;
}

/* 画像标签：学校层次 / 专业类型 / 起始年级 / 成绩水平 */
.profile {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
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
  flex: none;
  background: var(--primary-weak);
  border-color: #d3e0ff;
  color: var(--primary);
  font-weight: 500;
}

.case__summary {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text);
}

/* 结果贴在卡片底部，让几张卡片的这一行大致对齐 */
.case__result {
  margin: auto 0 0;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
}

.case__result-label {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--success-weak);
  color: var(--success);
  font-size: 12px;
  font-weight: 500;
}

/* "查看完整路线"：卡片可点这件事得有个明确提示，
   不然用户不一定知道卡片能点进去 */
.case__more {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--primary);
}

.case:hover .case__more {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .cases {
    grid-template-columns: 1fr;
  }
}
</style>
