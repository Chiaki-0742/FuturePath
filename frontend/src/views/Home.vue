<script setup>
import { onMounted, ref } from 'vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    await userStore.fetchInfo()
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <h1 class="page__title">
      你好，{{ userStore.userInfo?.username || '同学' }}
    </h1>
    <p class="page__subtitle">这里是你的个人主页</p>

    <div v-if="error" class="alert alert--error">
      {{ error }}
      <button class="btn btn--text" @click="load">重试</button>
    </div>

    <div v-if="loading" class="card muted">正在加载你的信息…</div>

    <template v-else-if="userStore.userInfo">
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
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.tile__year {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary);
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
