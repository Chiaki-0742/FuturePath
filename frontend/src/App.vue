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
        <RouterLink to="/" class="brand">大学生未来规划</RouterLink>

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
      Vue 3 + Vite 前端骨架 · 后端接口对接中
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
  background: #fff;
  border-bottom: 1px solid var(--border);
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
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
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

.nav__link--cta {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: #fff;
}

.nav__link--cta:hover {
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
