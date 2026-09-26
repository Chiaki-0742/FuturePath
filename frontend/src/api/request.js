import axios from 'axios'
import { API_BASE } from './config'
import { getToken, clearToken } from '../utils/token'

/**
 * 全项目唯一的 axios 实例。
 *
 * 它的价值在于：把"每个请求都要做的事"收拢到两个拦截器里，
 * 这样四个页面里就不用各写一遍了。
 */

const request = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
})

// ---------------------------------------------------------------
// 请求拦截器：发出去之前，自动带上 token
// 没有这个，后端不知道"你是谁"，个人中心就取不到自己的资料
// ---------------------------------------------------------------
request.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ---------------------------------------------------------------
// 响应拦截器：把后端返回的数据"拆包"，并统一转成中文错误提示
//
// 约定后端返回 { code, msg, data }
//   code = 200（或 0）→ 成功，只把 data 给页面
//   code = 401        → 登录过期，清掉 token 并回登录页
//   code = 其它       → 失败，抛出 msg
// 这样页面里拿到的永远是干净的数据，不用层层判断。
//
// 《1.4 接口约定》里的错误码（1001 参数格式不对 / 1002 密码太短 /
// 1003 用户名已存在 / 1004 用户名或密码错误）走的就是最后一条：
// 后端给什么 msg，页面就显示什么，前端不用为每个码写一个分支。
// ---------------------------------------------------------------
request.interceptors.response.use(
  (response) => {
    const body = response.data

    // 对方没按统一格式返回（比如直接返回了数组），就原样给出
    if (!body || typeof body !== 'object' || !('code' in body)) {
      return body
    }

    if (body.code === 200 || body.code === 0) {
      return body.data
    }

    // 登录过期：约定表把 401 和 1001~1004 放在同一列，
    // 说明后端很可能返回 {code: 401} 而不是 HTTP 401。
    // 两种都要认，不然会出现"token 已经失效、页面却还当自己登录着"
    // 这种极难排查的问题。下面响应失败的第二个参数里也处理了 HTTP 401。
    if (body.code === 401) {
      clearToken()
      window.location.hash = '#/login'
    }

    return Promise.reject(new Error(body.msg || '请求失败'))
  },

  (error) => {
    // 走不到后端（后端没启动、断网、超时）都会落到这里
    let message = '网络异常，请确认后端已经启动'

    if (error.code === 'ECONNABORTED') {
      message = '请求超时，请稍后重试'
    } else if (error.response) {
      const { status, data } = error.response

      if (status === 401) {
        message = '登录已过期，请重新登录'
        clearToken()
        // 直接跳回登录页（用 hash 方式，和 router 的模式保持一致）
        window.location.hash = '#/login'
      } else {
        message =
          (data && (data.msg || data.message)) || `请求失败（HTTP ${status}）`
      }
    }

    return Promise.reject(new Error(message))
  }
)

export default request
