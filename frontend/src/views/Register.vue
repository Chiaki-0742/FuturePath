<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

// el-form 的实例。校验要通过它：formRef.value.validate()
const formRef = ref(null)

// 字段对齐后端 users 表：{username, password, name, major, grade}
// 表里没有 email / phone，所以页面上也不收这两项。
const form = reactive({
  username: '',
  password: '',
  confirm: '',
  name: '',
  major: '',
  grade: '大一',
})

const gradeOptions = ['大一', '大二', '大三', '大四', '研究生']

/**
 * 校验规则 —— 这就是任务②要的 rules。
 * 每条规则里的 message，会由 el-form 自动显示在对应输入框的正下方（飘红字）。
 *
 *   required   必须填
 *   min / max  长度
 *   pattern    正则
 *   validator  自定义校验函数（比如"两次密码要一致"）
 *   trigger    什么时候触发检查：blur = 光标离开输入框时
 *
 * ⚠️ 前端校验只是让体验好一点，不是安全保证 ——
 *    用户随时能在浏览器里改掉这些代码，所以后端必须再校验一遍。
 */
const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { validator: notBlank, message: '请输入用户名', trigger: 'blur' },
    {
      // ⚠️ 必须和后端 app/routes/auth.py 里的校验保持一致：
      //    后端写的是 3 <= len(username) <= 20 且 username.isalnum()
      //    isalnum() 只认字母和数字 —— 下划线是不允许的。
      //    前端如果还按"允许下划线"放行，用户填了 stu_2026 会在后端吃 1001，
      //    看着像"两边都没错但就是不通"。
      pattern: /^[a-zA-Z0-9]{3,20}$/,
      message: '3~20 位，只能用字母或数字',
      trigger: 'blur',
    },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度需为 6~20 位', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再输入一次密码', trigger: 'blur' },
    { validator: checkConfirm, trigger: 'blur' },
  ],
  name: [
    { required: true, message: '请输入姓名', trigger: 'blur' },
    { validator: notBlank, message: '请输入姓名', trigger: 'blur' },
    { max: 20, message: '姓名不要超过 20 个字', trigger: 'blur' },
  ],
  major: [
    { required: true, message: '请输入专业', trigger: 'blur' },
    { validator: notBlank, message: '请输入专业', trigger: 'blur' },
  ],
  grade: [{ required: true, message: '请选择年级', trigger: 'change' }],
}

/** 自定义校验：两次密码必须一致 */
function checkConfirm(rule, value, callback) {
  if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

/** 自定义校验：不能只填空格（required 拦不住 "   " 这种） */
function notBlank(rule, value, callback) {
  if (!String(value ?? '').trim()) {
    callback(new Error(rule.message))
  } else {
    callback()
  }
}

const loading = ref(false)
const error = ref('')
const success = ref('')

async function handleSubmit() {
  error.value = ''
  success.value = ''

  // 校验不通过就停下 —— 红字已经由 el-form 自动显示在输入框下方了
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    const data = await userStore.doRegister({
      username: form.username.trim(),
      password: form.password,
      name: form.name.trim(),
      major: form.major.trim(),
      grade: form.grade,
    })

    // 后端目前是返回 {token} 的（注册即登录）。
    // 万一某个实现没返回 token，就退回「跳登录页，把用户名带过去预填」。
    if (data && data.token) {
      // 新手引导：刚注册的人一定没填过问卷，直接带过去填（任务 10/02 第 2 项）
      success.value = '注册成功，先花一分钟完成问卷…'
      setTimeout(() => {
        router.push({ name: 'survey' })
      }, 800)
    } else {
      success.value = '注册成功，正在跳转到登录页…'
      setTimeout(() => {
        router.push({ name: 'login', query: { username: form.username.trim() } })
      }, 800)
    }
  } catch (e) {
    // e.message 来自后端（或 mock），比如"用户名已存在"
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
      <div v-if="error || success" class="form-msgs">
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
        <el-alert v-if="success" :title="success" type="success" :closable="false" show-icon />
      </div>

      <!-- @submit.prevent 必须加：不加的话浏览器会刷新页面，请求看着就像"没发出去" -->
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
            placeholder="3~20 位字母或数字"
            autocomplete="username"
          />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            id="password"
            v-model="form.password"
            type="password"
            placeholder="6~20 位"
            autocomplete="new-password"
            show-password
          />
        </el-form-item>

        <el-form-item label="确认密码" prop="confirm">
          <el-input
            id="confirm"
            v-model="form.confirm"
            type="password"
            placeholder="再输入一次"
            autocomplete="new-password"
            show-password
          />
        </el-form-item>

        <el-form-item label="姓名" prop="name">
          <el-input
            id="name"
            v-model="form.name"
            placeholder="你的真实姓名或称呼"
            autocomplete="name"
          />
        </el-form-item>

        <el-form-item label="专业" prop="major">
          <el-input id="major" v-model="form.major" placeholder="如：计算机科学与技术" />
        </el-form-item>

        <el-form-item label="年级" prop="grade">
          <el-select v-model="form.grade" placeholder="请选择年级">
            <el-option v-for="g in gradeOptions" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>

        <el-button
          class="btn-submit"
          type="primary"
          native-type="submit"
          :loading="loading"
        >
          {{ loading ? '注册中…' : '注册' }}
        </el-button>
      </el-form>

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
