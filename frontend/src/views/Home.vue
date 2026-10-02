<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { fetchAnswers } from '@/api/survey'
import { readSurvey } from '@/utils/survey'

/**
 * 首页。
 *
 * 10/02 这里加了两件事：
 *
 * 1. 新手引导的【兜底】
 *    路由守卫在 mock 模式下能立刻判断"这个人填过问卷没"，
 *    但真后端下不行 —— 后端发的 token 是一串随机字符，
 *    反解不出用户名，守卫只能先放行。
 *    所以这里等 GET /api/me 拿到资料、知道"这是谁"之后，再补一次判断。
 *    两条路都有，引导才不会"在 mock 里好好的、一连真后端就失效"。
 *
 * 2. 把问卷的结论显示出来
 *    填完问卷跳回首页，如果首页一点变化都没有，
 *    会让人以为"填了跟没填一样"。有个明确的结果，闭环才算闭上。
 */

const router = useRouter()
const userStore = useUserStore()

const loading = ref(false)
const error = ref('')

// 问卷相关
const surveyDone = ref(false)
const direction = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    await userStore.fetchInfo()
    await loadSurvey()
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadSurvey() {
  const username = userStore.userInfo?.username
  if (!username) return

  // 先看本地：用户如果点过"以后再说"，就尊重他的选择，别再拦
  // （后端不知道"跳过"这回事 —— 跳过不会提交到服务器，
  //   只在本地记一笔。不在这里判掉的话，跳过的人一进首页又会被弹回去）
  const local = readSurvey(username)
  if (local && local.skipped) return

  // 再问后端：换台电脑填过问卷的人，本地没有记录，但服务器上有
  const data = await fetchAnswers(username)
  const answer = data && data.filled ? data.answer : null

  // 既没跳过、也没填过 → 补一次新手引导
  if (!answer) {
    router.replace({ name: 'survey', query: { redirect: '/' } })
    return
  }

  surveyDone.value = true
  direction.value = answer.direction || ''
}

onMounted(load)
</script>

<template>
  <div class="page">
    <h1 class="page__title">
      你好，{{ userStore.userInfo?.username || '同学' }}
      <el-tag v-if="userStore.userInfo?.grade" class="title-tag" effect="light" round>
        {{ userStore.userInfo.grade }}
      </el-tag>
    </h1>
    <p class="page__subtitle">这里是你的个人主页</p>

    <div v-if="error" class="alert alert--error">
      {{ error }}
      <button class="btn btn--text" @click="load">重试</button>
    </div>

    <div v-if="loading" class="card muted">正在加载你的信息…</div>

    <template v-else-if="userStore.userInfo">
      <div class="card card--direction">
        <h2 class="card__title">你的方向</h2>

        <template v-if="surveyDone">
          <p class="direction">{{ direction || '还没想好' }}</p>
          <p class="card__hint">来自你填的规划问卷。想改的话，随时可以重填</p>
          <RouterLink to="/survey" class="btn btn--text">重新填写问卷</RouterLink>
        </template>

        <template v-else>
          <p class="card__hint">
            还没有确定方向 —— 做个一分钟的小问卷，我们按你的情况给建议
          </p>
          <RouterLink to="/survey" class="btn">去填问卷</RouterLink>
        </template>
      </div>

      <div class="card">
        <h2 class="card__title">账号信息</h2>
        <p class="card__hint">这些数据来自接口 GET /api/me</p>

        <dl class="info">
          <div class="info__row">
            <dt>用户名</dt>
            <dd>{{ userStore.userInfo.username }}</dd>
          </div>
          <div class="info__row">
            <dt>姓名</dt>
            <dd>{{ userStore.userInfo.name || '未填写' }}</dd>
          </div>
          <div class="info__row">
            <dt>专业</dt>
            <dd>{{ userStore.userInfo.major || '未填写' }}</dd>
          </div>
          <div class="info__row">
            <dt>年级</dt>
            <dd>{{ userStore.userInfo.grade || '未填写' }}</dd>
          </div>
        </dl>

        <RouterLink to="/profile" class="btn">去个人中心完善资料</RouterLink>
      </div>

      <h2 class="section__title">大学四年，这样安排</h2>

      <div class="tiles">
        <div class="tile">
          <p class="tile__year">大一</p>
          <h3 class="tile__title">适应与探索</h3>
          <p class="tile__desc">
            先把作息和基础课稳住，摸清学校里的资源在哪。社团挑 1~2 个就够，
            一上来铺太开，后面哪样都留不住。
          </p>
        </div>

        <div class="tile">
          <p class="tile__year">大二</p>
          <h3 class="tile__title">打牢基础</h3>
          <p class="tile__desc">
            这个阶段最值钱的是绩点和英语，四六级尽早过。再挑一个方向
            开始动手做点东西，别停在"想学"。
          </p>
        </div>

        <div class="tile">
          <p class="tile__year">大三</p>
          <h3 class="tile__title">确定方向</h3>
          <p class="tile__desc">
            保研、考研、就业、留学，这时候得选一条主路，然后开始
            为它攒拿得出手的证据。
          </p>
        </div>

        <div class="tile">
          <p class="tile__year">大四</p>
          <h3 class="tile__title">冲刺落地</h3>
          <p class="tile__desc">
            毕设、实习、简历、面试。把前三年攒下的东西整理成
            一份能递出去的材料。
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.info {
  margin: 0 0 20px;
}

.info__row {
  display: flex;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.info__row:last-child {
  border-bottom: none;
}

.info__row dt {
  width: 88px;
  flex: none;
  color: var(--text-2);
  font-size: 13px;
  margin: 0;
}

.info__row dd {
  margin: 0;
  flex: 1;
  word-break: break-all;
}

/* 方向卡片：这是填完问卷后最该被看到的东西，给它一点强调 */
.card--direction {
  border-color: #d5e0f7;
  background: linear-gradient(180deg, #f7faff 0%, var(--surface) 70%);
}

/* 「工商管理」这种词比「考研」长，字号小一点就不会撑破卡片 */
.direction {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--primary);
  word-break: break-all;
}

.section__title {
  margin: 28px 0 14px;
  font-size: 16px;
  font-weight: 500;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.tile {
  padding: 18px;
  border: 1px solid #e9edf4;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(28, 36, 48, 0.03);
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}

/* 鼠标划过时轻轻抬起来，让页面不那么"死" */
.tile:hover {
  transform: translateY(-3px);
  border-color: #d5e0f7;
  box-shadow: 0 2px 6px rgba(28, 36, 48, 0.05),
    0 14px 30px -20px rgba(47, 107, 255, 0.6);
}

.tile__year {
  display: inline-block;
  margin: 0 0 10px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--primary-weak);
  font-size: 12px;
  font-weight: 500;
  color: var(--primary);
  letter-spacing: 0.02em;
}

.title-tag {
  margin-left: 8px;
  vertical-align: middle;
  font-weight: 400;
}

.tile__title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 500;
}

.tile__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
}

@media (max-width: 560px) {
  .tiles {
    grid-template-columns: 1fr;
  }
}
</style>
