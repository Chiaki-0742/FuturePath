<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { USE_MOCK } from '@/api/config'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const formRef = ref(null)

const form = reactive({
  // 从注册页跳过来时会带上用户名，直接预填
  username: typeof route.query.username === 'string' ? route.query.username : '',
  password: '',
})

// 校验规则：错误提示会自动显示在输入框正下方
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  error.value = ''

  // 校验不通过就停下（红字已经显示出来了）
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    await userStore.doLogin({
      username: form.username.trim(),
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
      <div v-if="error" class="form-msgs">
        <el-alert :title="error" type="error" :closable="false" show-icon />
      </div>

      <div v-if="USE_MOCK" class="form-msgs">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>
            当前是本地 Mock 模式，可直接用测试账号登录：用户名
            <strong>test</strong>　密码 <strong>123456</strong>
          </template>
        </el-alert>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        require-asterisk-position="right"
        @submit.prevent="handleSubmit"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            id="username"
            v-model="form.username"
            placeholder="请输入用户名"
            autocomplete="username"
          />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            id="password"
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
            show-password
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-button class="btn-submit" type="primary" native-type="submit" :loading="loading">
          {{ loading ? '登录中…' : '登录' }}
        </el-button>
      </el-form>

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
