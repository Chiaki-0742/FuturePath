<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const formRef = ref(null)

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')

// 字段对标后端 GET /api/me 的返回：{username, name, major, grade}
// 表里没有 email / phone，所以这两个输入框已经拿掉了 ——
// 留着它们会让人以为能存，实际后端根本不认，属于"假功能"。
const form = reactive({
  name: '',
  major: '',
  grade: '',
})

const gradeOptions = ['大一', '大二', '大三', '大四', '研究生']

// 校验规则：错误提示会自动显示在输入框正下方
const rules = {
  name: [
    { required: true, message: '请输入姓名', trigger: 'blur' },
    { validator: notBlank, message: '请输入姓名', trigger: 'blur' },
  ],
  major: [
    { required: true, message: '请输入专业', trigger: 'blur' },
    { validator: notBlank, message: '请输入专业', trigger: 'blur' },
  ],
  grade: [{ required: true, message: '请选择年级', trigger: 'change' }],
}

/** 自定义校验：不能只填空格（required 拦不住 "   " 这种） */
function notBlank(rule, value, callback) {
  if (!String(value ?? '').trim()) {
    callback(new Error(rule.message))
  } else {
    callback()
  }
}

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

  // 校验不通过就停下（红字已经显示出来了）
  try {
    await formRef.value.validate()
  } catch {
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
      <div v-if="error || success" class="form-msgs">
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
        <el-alert v-if="success" :title="success" type="success" :closable="false" show-icon />
      </div>

      <div v-if="loading" class="muted">正在加载…</div>

      <template v-else>
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          require-asterisk-position="right"
          @submit.prevent="handleSave"
        >
          <el-form-item label="用户名">
            <el-input :model-value="userStore.userInfo?.username || ''" disabled />
            <p class="field__hint">用户名不可修改</p>
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

          <el-button class="btn-submit" type="primary" native-type="submit" :loading="saving">
            {{ saving ? '保存中…' : '保存修改' }}
          </el-button>
        </el-form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.field__hint {
  /* width:100% 是为了让它从输入框旁边换行到下一行 */
  width: 100%;
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.5;
}
</style>
