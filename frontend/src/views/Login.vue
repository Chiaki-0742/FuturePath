<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { USE_MOCK } from '@/api/config'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const form = reactive({
  // 从注册页跳过来时会带上用户名，直接预填
  username: typeof route.query.username === 'string' ? route.query.username : '',
  password: '',
})

const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  error.value = ''

  if (!form.username || !form.password) {
    error.value = '请填写用户名和密码'
    return
  }

  loading.value = true
  try {
    await userStore.doLogin({
      username: form.username,
      password: form.password,
    })

    // 登录前想去的页面（被守卫拦下来时记的），登录后送回去
    const redirect = route.query.redirect
    router.push(typeof redirect === 'string' ? redirect : { name: 'home' })
  } catch (e) {
    error.value = e.message || '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page page--narrow">
    <h1 class="page__title">登录</h1>
    <p class="page__subtitle">登录后查看你的个人规划</p>

    <div class="card">
      <div v-if="error" class="alert alert--error">{{ error }}</div>

      <div v-if="USE_MOCK" class="alert alert--info">
        当前是本地 Mock 模式，可直接用测试账号登录：<br />
        用户名 <strong>test</strong>　密码 <strong>123456</strong>
      </div>

      <form novalidate @submit.prevent="handleSubmit">
        <div class="field">
          <label class="field__label" for="username">用户名</label>
          <input
            id="username"
            v-model.trim="form.username"
            class="input"
            type="text"
            placeholder="请输入用户名"
            autocomplete="username"
          />
        </div>

        <div class="field">
          <label class="field__label" for="password">密码</label>
          <input
            id="password"
            v-model="form.password"
            class="input"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
          />
        </div>

        <button class="btn btn--primary btn--block" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>

      <p class="switch-line">
        还没有账号？<RouterLink to="/register">去注册</RouterLink>
      </p>
    </div>
  </div>
</template>

<style scoped>
.switch-line {
  margin: 18px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-2);
}
</style>
