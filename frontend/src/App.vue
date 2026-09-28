<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const isLoggedIn = computed(() => !!userStore.token)

async function handleLogout() {
  await userStore.doLogout()
  router.push({ name: 'login' })
}

// 刷新页面后，token 还在但内存里的资料没了，这里补拉一次
onMounted(() => {
  if (userStore.token && !userStore.userInfo) {
    userStore.fetchInfo().catch(() => {})
  }
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="topbar__inner">
        <RouterLink to="/" class="brand">
          <span class="brand__dot"></span>
          大学生未来规划
        </RouterLink>

        <nav class="nav">
          <template v-if="isLoggedIn">
            <RouterLink to="/" class="nav__link">首页</RouterLink>
            <RouterLink to="/profile" class="nav__link">个人中心</RouterLink>
            <button class="btn btn--text" @click="handleLogout">退出登录</button>
          </template>

          <template v-else>
            <RouterLink to="/login" class="nav__link">登录</RouterLink>
            <RouterLink to="/register" class="nav__link nav__link--cta">
              注册
            </RouterLink>
          </template>
        </nav>
      </div>
    </header>

    <main class="main">
      <RouterView />
    </main>

    <footer class="footer">
      Vue 3 + Vite + Element Plus · 后端接口对接中
    </footer>
  </div>
</template>

<style scoped>
.app {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.topbar {
  /* 半透明 + 毛玻璃：滚动时内容从底下透出来，比一条死白更透气 */
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 6px 20px -18px rgba(28, 36, 48, 0.5);
  position: sticky;
  top: 0;
  z-index: 10;
}

.topbar__inner {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 20px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.brand__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2f6bff, #6d97ff);
  box-shadow: 0 0 0 4px rgba(47, 107, 255, 0.12);
}

.brand:hover {
  text-decoration: none;
}

.nav {
  display: flex;
  align-items: center;
  gap: 18px;
}

.nav__link {
  font-size: 14px;
  color: var(--text-2);
}

.nav__link:hover {
  color: var(--primary);
  text-decoration: none;
}

.nav__link.router-link-exact-active {
  color: var(--primary);
  font-weight: 500;
}

/* ⚠️ 这里必须写成 .nav__link.nav__link--cta（连着两个类），
   不能只写 .nav__link--cta。因为上面那条 .nav__link.router-link-exact-active
   的优先级更高（两个类 > 一个类），在 /register 页面上「注册」按钮正好命中它，
   文字颜色会被改成 --primary —— 而按钮底色也是 --primary，
   白字就这么"消失"了，看起来像一个没有文字的空按钮。 */
.nav__link.nav__link--cta {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: #fff;
}

.nav__link.nav__link--cta:hover,
.nav__link.nav__link--cta.router-link-exact-active {
  background: var(--primary-dark);
  color: #fff;
}

.main {
  flex: 1;
}

.footer {
  text-align: center;
  padding: 20px;
  font-size: 12px;
  color: var(--text-3);
  border-top: 1px solid var(--border);
}
</style>
