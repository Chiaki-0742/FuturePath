<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

// 字段对齐 C 的《数据库对接说明》第 2 节的 user 表：
//   {username, password, name, major, grade}
// 表里没有 email / phone，所以页面上也不收这两项。
// 姓名是必填 —— 文档第 5 节的注册接口校验写着"用户名、密码、姓名不能为空"。
const form = reactive({
  username: '',
  password: '',
  confirm: '',
  name: '',
  major: '',
  grade: '大一',
})
const fieldErrors = reactive({
  username: '',
  password: '',
  confirm: '',
  name: '',
  major: '',
  grade: '',
})

const gradeOptions = ['大一', '大二', '大三', '大四', '研究生']

const loading = ref(false)
const error = ref('')
const success = ref('')

/**
 * 前端校验。
 * 注意：前端校验只是"体验好"，绝不能当成安全保证 ——
 * 后端必须再校验一遍，因为前端代码用户随时能在浏览器里改掉。
 * （C 的文档里 1001 = 参数缺失或格式错误，就是后端那道防线）
 */
function validate() {
  fieldErrors.username = ''
  fieldErrors.password = ''
  fieldErrors.confirm = ''
  fieldErrors.name = ''
  fieldErrors.major = ''
  fieldErrors.grade = ''

  if (!form.username) {
    fieldErrors.username = '请输入用户名'
  } else if (!/^[a-zA-Z0-9_]{4,16}$/.test(form.username)) {
    fieldErrors.username = '4~16 位，只能用字母、数字、下划线'
  }

  if (!form.password) {
    fieldErrors.password = '请输入密码'
  } else if (form.password.length < 6 || form.password.length > 20) {
    fieldErrors.password = '密码长度需为 6~20 位'
  }

  if (!form.confirm) {
    fieldErrors.confirm = '请再输入一次密码'
  } else if (form.confirm !== form.password) {
    fieldErrors.confirm = '两次输入的密码不一致'
  }

  if (!form.name.trim()) {
    fieldErrors.name = '请输入姓名'
  } else if (form.name.trim().length > 20) {
    fieldErrors.name = '姓名不要超过 20 个字'
  }

  if (!form.major.trim()) {
    fieldErrors.major = '请输入专业'
  }

  if (!form.grade) {
    fieldErrors.grade = '请选择年级'
  }

  return Object.keys(fieldErrors).every((key) => !fieldErrors[key])
}

async function handleSubmit() {
  error.value = ''
  success.value = ''
  if (!validate()) return

  loading.value = true
  try {
    const data = await userStore.doRegister({
      username: form.username,
      password: form.password,
      name: form.name.trim(),
      major: form.major.trim(),
      grade: form.grade,
    })

    // 注册接口的返回，两份文档不一致（旧约定表 {token}、新文档 null），
    // 所以这里两可处理：有 token 说明后端顺手把我们登录了，直接进首页；
    // 没有 token 就跳登录页，并把用户名带过去帮用户预填。
    if (data && data.token) {
      success.value = '注册成功，已为你自动登录…'
      setTimeout(() => {
        router.push({ name: 'home' })
      }, 800)
    } else {
      success.value = '注册成功，正在跳转到登录页…'
      setTimeout(() => {
        router.push({ name: 'login', query: { username: form.username } })
      }, 800)
    }
  } catch (e) {
    // 这里的 e.message 来自后端（或 mock），比如"用户名已存在"
    error.value = e.message || '注册失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page page--narrow">
    <h1 class="page__title">创建账号</h1>
    <p class="page__subtitle">注册后可以保存你的规划结果</p>

    <div class="card">
      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <div v-if="success" class="alert alert--success">{{ success }}</div>

      <!-- @submit.prevent 必须加：不加的话浏览器会刷新页面，
           请求看着就像"没发出去" -->
      <form novalidate @submit.prevent="handleSubmit">
        <div class="field">
          <label class="field__label" for="username">
            用户名<span class="req">*</span>
          </label>
          <input
            id="username"
            v-model.trim="form.username"
            class="input"
            :class="{ 'input--error': fieldErrors.username }"
            type="text"
            placeholder="4~16 位字母、数字或下划线"
            autocomplete="username"
          />
          <p v-if="fieldErrors.username" class="field__error">
            {{ fieldErrors.username }}
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="password">
            密码<span class="req">*</span>
          </label>
          <input
            id="password"
            v-model="form.password"
            class="input"
            :class="{ 'input--error': fieldErrors.password }"
            type="password"
            placeholder="6~20 位"
            autocomplete="new-password"
          />
          <p v-if="fieldErrors.password" class="field__error">
            {{ fieldErrors.password }}
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="confirm">
            确认密码<span class="req">*</span>
          </label>
          <input
            id="confirm"
            v-model="form.confirm"
            class="input"
            :class="{ 'input--error': fieldErrors.confirm }"
            type="password"
            placeholder="再输入一次"
            autocomplete="new-password"
          />
          <p v-if="fieldErrors.confirm" class="field__error">
            {{ fieldErrors.confirm }}
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="name">
            姓名<span class="req">*</span>
          </label>
          <input
            id="name"
            v-model.trim="form.name"
            class="input"
            :class="{ 'input--error': fieldErrors.name }"
            type="text"
            placeholder="你的真实姓名或称呼"
            autocomplete="name"
          />
          <p v-if="fieldErrors.name" class="field__error">
            {{ fieldErrors.name }}
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="major">
            专业<span class="req">*</span>
          </label>
          <input
            id="major"
            v-model.trim="form.major"
            class="input"
            :class="{ 'input--error': fieldErrors.major }"
            type="text"
            placeholder="如：计算机科学与技术"
          />
          <p v-if="fieldErrors.major" class="field__error">
            {{ fieldErrors.major }}
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="grade">
            年级<span class="req">*</span>
          </label>
          <select
            id="grade"
            v-model="form.grade"
            class="input"
            :class="{ 'input--error': fieldErrors.grade }"
          >
            <option value="">请选择</option>
            <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
          </select>
          <p v-if="fieldErrors.grade" class="field__error">
            {{ fieldErrors.grade }}
          </p>
        </div>

        <button class="btn btn--primary btn--block" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          {{ loading ? '注册中…' : '注册' }}
        </button>
      </form>

      <p class="switch-line">
        已经有账号了？<RouterLink to="/login">去登录</RouterLink>
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
