import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as userApi from '@/api/user'
import { getToken, setToken, clearToken } from '@/utils/token'

/**
 * 用户状态（Pinia）。
 *
 * 为什么要用这个？因为"当前登录的是谁"这件事，
 * 顶栏要用、首页要用、个人中心也要用。
 * 放在这里，任何页面 import 一下就能拿到，不用一层层传。
 *
 * 依据 C 的《数据库对接说明》（2026-09-27）：
 *   1. login 的返回只有 {token}，不含用户资料 → 资料另外用 GET /api/me 取
 *   2. register 的返回两份文档不一致（新文档示例是 null、旧约定表是 {token}），
 *      所以这里做成两可：拿到 token 就当已登录，拿不到就交给页面跳登录页
 */
export const useUserStore = defineStore('user', () => {
  // token 从 localStorage 初始化，这样刷新页面登录状态不会丢
  const token = ref(getToken())

  // 用户资料，按约定只有这四样：username / name / major / grade
  const userInfo = ref(null)

  // 登录
  async function doLogin(payload) {
    const data = await userApi.login(payload)

    // 防御：后端如果没按约定返回 token，宁可明确报错，
    // 也不要带着一个空的登录态继续跑（那种 bug 极难查）
    if (!data || !data.token) {
      throw new Error('登录失败：接口没有返回 token，请检查后端返回格式')
    }

    token.value = data.token
    setToken(data.token)

    // 约定里 login 只返回 token，没有资料。
    // 后端如果额外塞了 user（有些实现会），就先存着省一次请求；
    // 没有的话，首页/个人中心挂载时会用 GET /api/me 去取。
    userInfo.value = data.user || null

    return data
  }

  // 注册。约定里注册接口返回 data:{token}，所以注册成功直接算登录
  async function doRegister(payload) {
    const data = await userApi.register(payload)

    if (data && data.token) {
      token.value = data.token
      setToken(data.token)
    }

    return data
  }

  // 拉取当前用户资料（GET /api/me）
  async function fetchInfo() {
    const data = await userApi.getInfo()
    userInfo.value = data
    return data
  }

  // 保存个人资料（PUT /api/me，表外补充，需 C 确认）
  async function saveInfo(payload) {
    const data = await userApi.updateInfo(payload)
    userInfo.value = data
    return data
  }

  // 退出登录
  //
  // 约定表里没有 logout 接口，所以这里不发任何请求：
  // token 就存在浏览器本地，删掉它 = 退出登录。
  // 这样后端少写一个接口，也不会有"请求失败就退不出去"的问题。
  async function doLogout() {
    token.value = ''
    userInfo.value = null
    clearToken()
  }

  return { token, userInfo, doLogin, doRegister, fetchInfo, saveInfo, doLogout }
})
