<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchSecurityQuestion,
  resetPassword,
  verifySecurityAnswer,
} from '@/api/security'

/**
 * 忘记密码 → 用密保问题重置。
 *
 * 为什么是"重置"而不是"找回"：密码在数据库里是加密存的，
 * 连我们自己都看不到原文（能做到"把原密码告诉你"的网站，说明它存的是明文，
 * 那才是真危险）。所以这里做的是：确认你是你 → 让你设一个新密码。
 *
 * 三步走（后端也是三个接口，一一对应）：
 *   1. 填用户名        → GET  /api/security/question
 *   2. 回答密保问题     → POST /api/security/verify   → 拿到一张一次性凭证
 *   3. 用凭证设新密码   → POST /api/security/reset
 *
 * 凭证只存在内存里（`resetToken`），不进 localStorage ——
 * 刷新页面就重新走一遍，这是有意的：那张凭证等于"临时通行证"，
 * 留在本地反而是个隐患。
 */

const router = useRouter()

const step = ref(1)
const stepLabels = ['填用户名', '答密保问题', '设新密码']

const question = ref('')
const resetToken = ref('')
const done = ref(false)
const loading = ref(false)
const error = ref('')
const formRef = ref(null)

const form = reactive({
  username: '',
  answer: '',
  newPassword: '',
  confirm: '',
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { validator: notBlank, message: '请输入用户名', trigger: 'blur' },
  ],
  answer: [
    { required: true, message: '请填写答案', trigger: 'blur' },
    { validator: notBlank, message: '请填写答案', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    // 和后端 auth.py 的 PASSWORD_MIN / PASSWORD_MAX 对齐
    { min: 6, max: 64, message: '密码长度需为 6~64 位', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再输入一次新密码', trigger: 'blur' },
    { validator: checkConfirm, trigger: 'blur' },
  ],
}

function notBlank(rule, value, callback) {
  if (!String(value ?? '').trim()) {
    callback(new Error(rule.message))
  } else {
    callback()
  }
}

function checkConfirm(rule, value, callback) {
  if (value !== form.newPassword) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

/**
 * 只校验当前这一步的字段。
 * 三步共用同一个 el-form（这样样式、红字提示的位置都和别的表单一致），
 * 但不能用整表 validate() —— 那会把还没轮到的字段也一起校验，
 * 用户在第 1 步就会看到"请输入新密码"这种莫名其妙的红字。
 */
async function validateOnly(fields) {
  try {
    await formRef.value.validateField(fields)
    return true
  } catch {
    return false
  }
}

// ---- 第 1 步：查这个账号设的密保问题 ----
async function submitUsername() {
  error.value = ''
  if (!(await validateOnly(['username']))) return

  loading.value = true
  try {
    const data = await fetchSecurityQuestion(form.username.trim())
    question.value = data.question
    step.value = 2
  } catch (e) {
    // 后端对"用户不存在"和"没设过密保"返回的是同一句话（1008），
    // 这是故意的 —— 否则这个接口就能被用来试探哪些用户名已被注册。
    error.value = e.message || '没有查到密保问题'
  } finally {
    loading.value = false
  }
}

// ---- 第 2 步：回答问题，答对换凭证 ----
async function submitAnswer() {
  error.value = ''
  if (!(await validateOnly(['answer']))) return

  loading.value = true
  try {
    const data = await verifySecurityAnswer(form.username.trim(), form.answer.trim())
    resetToken.value = data.reset_token
    error.value = ''
    step.value = 3
  } catch (e) {
    // 1009 答案不对（msg 里会带还剩几次机会）
    // 1011 连错太多次被锁（msg 里会带还要等几分钟）
    // 两种都原样显示后端的话 —— 它写得比我在这里拼的清楚
    error.value = e.message || '验证失败，请重试'
  } finally {
    loading.value = false
  }
}

// ---- 第 3 步：用凭证设新密码 ----
async function submitNewPassword() {
  error.value = ''
  if (!(await validateOnly(['newPassword', 'confirm']))) return

  loading.value = true
  try {
    await resetPassword(resetToken.value, form.newPassword)
    done.value = true
  } catch (e) {
    if (e.code === 1010) {
      // 凭证过期或被用过 → 退回第 1 步重新走一遍
      resetToken.value = ''
      form.answer = ''
      step.value = 1
      error.value = (e.message || '重置凭证已失效') + '，请重新验证一次'
    } else {
      error.value = e.message || '重置失败，请重试'
    }
  } finally {
    loading.value = false
  }
}

function backToStep1() {
  error.value = ''
  question.value = ''
  form.answer = ''
  step.value = 1
}

function goLogin() {
  router.push({ name: 'login', query: { username: form.username.trim() } })
}
</script>

<template>
  <div class="page page--narrow">
    <h1 class="page__title">{{ done ? '密码已重置' : '找回密码' }}</h1>
    <p class="page__subtitle">
      {{
        done
          ? '用新密码登录就可以了'
          : '回答注册时设置的密保问题，就能重设密码'
      }}
    </p>

    <div class="card">
      <ol v-if="!done" class="steps">
        <li
          v-for="(label, i) in stepLabels"
          :key="label"
          :class="{
            'is-active': step === i + 1,
            'is-done': step > i + 1,
          }"
        >
          <span class="steps__dot">{{ i + 1 }}</span>
          <span class="steps__label">{{ label }}</span>
        </li>
      </ol>

      <div v-if="error" class="form-msgs">
        <el-alert :title="error" type="error" :closable="false" show-icon />
      </div>

      <template v-if="done">
        <p class="done-line">
          账号 <strong>{{ form.username }}</strong> 的密码已经改好了。
        </p>
        <el-button class="btn-submit" type="primary" @click="goLogin">
          去登录
        </el-button>
      </template>

      <el-form
        v-else
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        require-asterisk-position="right"
        @submit.prevent
      >
        <template v-if="step === 1">
          <el-form-item label="用户名" prop="username">
            <el-input
              id="username"
              v-model="form.username"
              placeholder="注册时用的用户名"
              autocomplete="username"
              @keyup.enter="submitUsername"
            />
          </el-form-item>
          <el-button
            class="btn-submit"
            type="primary"
            :loading="loading"
            @click="submitUsername"
          >
            {{ loading ? '查询中…' : '下一步' }}
          </el-button>
        </template>

        <template v-else-if="step === 2">
          <div class="question-box">
            <p class="question-box__label">你设置的问题是</p>
            <p class="question-box__text">{{ question }}</p>
          </div>

          <el-form-item label="你的答案" prop="answer">
            <el-input
              id="answer"
              v-model="form.answer"
              placeholder="不分大小写，首尾空格会自动忽略"
              @keyup.enter="submitAnswer"
            />
          </el-form-item>
          <el-button
            class="btn-submit"
            type="primary"
            :loading="loading"
            @click="submitAnswer"
          >
            {{ loading ? '验证中…' : '验证' }}
          </el-button>
        </template>

        <template v-else>
          <el-form-item label="新密码" prop="newPassword">
            <el-input
              id="newPassword"
              v-model="form.newPassword"
              type="password"
              placeholder="6~64 位"
              autocomplete="new-password"
              show-password
            />
          </el-form-item>

          <el-form-item label="确认新密码" prop="confirm">
            <el-input
              id="confirm"
              v-model="form.confirm"
              type="password"
              placeholder="再输入一次"
              autocomplete="new-password"
              show-password
              @keyup.enter="submitNewPassword"
            />
          </el-form-item>

          <el-button
            class="btn-submit"
            type="primary"
            :loading="loading"
            @click="submitNewPassword"
          >
            {{ loading ? '提交中…' : '重设密码' }}
          </el-button>

          <p class="note-line">
            改完之后，其它地方已经登录的账号会被退出，需要用新密码重新登录。
          </p>
        </template>
      </el-form>

      <p v-if="!done" class="switch-line">
        <button v-if="step === 2" class="btn btn--text" type="button" @click="backToStep1">
          换个账号
        </button>
        <RouterLink to="/login">回去登录</RouterLink>
      </p>
    </div>
  </div>
</template>

<style scoped>
/* ---------------- 顶部三步指示 ---------------- */
.steps {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 22px;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--text-3);
}

.steps li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

/* 步骤之间加一条短横线，看起来像"进度" */
.steps li + li::before {
  content: '';
  width: 14px;
  height: 1px;
  background: var(--border-strong);
  flex: none;
}

.steps__dot {
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  border: 1px solid var(--border-strong);
  font-size: 11px;
}

.steps li.is-active {
  color: var(--primary);
  font-weight: 500;
}

.steps li.is-active .steps__dot {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.steps li.is-done .steps__dot {
  background: var(--primary-weak);
  border-color: #c5d5ff;
  color: var(--primary);
}

/* ---------------- 密保问题展示 ---------------- */
.question-box {
  margin-bottom: 18px;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--primary-weak);
  border: 1px solid #d3e0ff;
}

.question-box__label {
  margin: 0 0 4px;
  font-size: 12px;
  color: #5a7bd0;
}

.question-box__text {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: #1f52d0;
  word-break: break-word;
}

/* ---------------- 收尾 ---------------- */
.done-line {
  margin: 0 0 20px;
  font-size: 14px;
}

.note-line {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-3);
}

.switch-line {
  margin: 18px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  font-size: 13px;
  color: var(--text-2);
}
</style>
