/**
 * token 的读写。
 * 为什么要单独放一个文件？
 * 因为"存 token 用的 key"要在好几个地方用（登录时写、请求时读、退出时删），
 * 散在各处写字符串，改一次就要翻遍全项目，还容易拼错。
 */

const TOKEN_KEY = 'plan_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token) {
  // 防御：拿到空值千万不要写进 localStorage。
  // 因为 localStorage 会把 undefined 存成字符串 "undefined"，
  // 那是个非空字符串，会让路由守卫误以为"已登录"，非常难排查。
  if (!token) return
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* 浏览器禁用了 localStorage，忽略即可 */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* 同上 */
  }
}
