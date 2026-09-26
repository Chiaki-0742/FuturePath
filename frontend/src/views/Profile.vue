<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')

// 字段严格对齐约定表里 GET /api/me 的返回：
//   {username, name, major, grade}
// 表里没有 email / phone，所以这两个输入框已经拿掉了 ——
// 留着它们会让人以为能存，实际后端根本不认，属于"假功能"。
const form = reactive({
  name: '',
  major: '',
  grade: '',
})

const gradeOptions = ['大一', '大二', '大三', '大四', '研究生']

function fillForm(user) {
  form.name = user.name || ''
  form.major = user.major || ''
  form.grade = user.grade || ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const user = await userStore.fetchInfo()
    fillForm(user)
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  error.value = ''
  success.value = ''

  if (!form.name.trim()) {
    error.value = '姓名不能为空'
    return
  }
  if (!form.major.trim()) {
    error.value = '专业不能为空'
    return
  }

  saving.value = true
  try {
    await userStore.saveInfo({
      name: form.name.trim(),
      major: form.major.trim(),
      grade: form.grade,
    })
    success.value = '保存成功'
  } catch (e) {
    error.value = e.message || '保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page page--narrow">
    <h1 class="page__title">个人中心</h1>
    <p class="page__subtitle">管理你的账号资料</p>

    <div class="card">
      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <div v-if="success" class="alert alert--success">{{ success }}</div>

      <div v-if="loading" class="muted">正在加载…</div>

      <template v-else>
        <div class="field">
          <label class="field__label">用户名</label>
          <input
            class="input"
            type="text"
            :value="userStore.userInfo?.username || ''"
            disabled
          />
          <p class="field__hint">用户名不可修改</p>
        </div>

        <form novalidate @submit.prevent="handleSave">
          <div class="field">
            <label class="field__label" for="name">姓名</label>
            <input
              id="name"
              v-model.trim="form.name"
              class="input"
              type="text"
              placeholder="你的真实姓名或称呼"
              autocomplete="name"
            />
          </div>

          <div class="field">
            <label class="field__label" for="major">专业</label>
            <input
              id="major"
              v-model.trim="form.major"
              class="input"
              type="text"
              placeholder="如：计算机科学与技术"
            />
          </div>

          <div class="field">
            <label class="field__label" for="grade">年级</label>
            <select id="grade" v-model="form.grade" class="input">
              <option value="">请选择</option>
              <option v-for="g in gradeOptions" :key="g" :value="g">
                {{ g }}
              </option>
            </select>
          </div>

          <button
            class="btn btn--primary btn--block"
            type="submit"
            :disabled="saving"
          >
            <span v-if="saving" class="spinner"></span>
            {{ saving ? '保存中…' : '保存修改' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.field__hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.input:disabled {
  background: #f7f8fa;
  color: var(--text-3);
  cursor: not-allowed;
}
</style>
