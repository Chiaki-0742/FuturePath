import request from './request'
import * as mock from './mock'
import { USE_MOCK } from './config'

/**
 * 密保问题 / 忘记密码相关接口。共三个，按使用顺序：
 *
 *   GET  /api/security/question?username=xxx   取回这个账号设的密保问题
 *   POST /api/security/verify                  提交答案，答对换一张重置凭证
 *   POST /api/security/reset                   拿凭证设置新密码
 *
 * 和后端 auth.py 里那三个接口一一对应。
 *
 * ★ 为什么先"验证"再"重置"、中间还要一张凭证：
 *   密码是哈希存的，找回原密码天生做不到，能做的是「重置」。
 *   而重置必须先把身份确认清楚 —— 凭证就是"这个人刚刚答对了密保"的凭据，
 *   它是一次性的、10 分钟过期，所以即使被截获，能用的窗口也很短。
 *
 * ★ 错误码（页面靠 code 给不同引导，所以要认准）：
 *   1008  这个账号没设过密保（含"用户不存在"，后端故意不区分）
 *   1009  答案不对（msg 里带了还剩几次）
 *   1010  重置凭证无效或已过期 → 让用户回去重新答一次
 *   1011  答错次数太多被锁 → msg 里带了还要等几分钟
 */

export function fetchSecurityQuestion(username) {
  if (USE_MOCK) return mock.securityQuestion(username)
  return request.get('/security/question', { params: { username } })
}

export function verifySecurityAnswer(username, answer) {
  if (USE_MOCK) return mock.securityVerify(username, answer)
  return request.post('/security/verify', { username, answer })
}

export function resetPassword(resetToken, newPassword) {
  if (USE_MOCK) return mock.securityReset(resetToken, newPassword)
  // 注意字段名：后端要的是 reset_token / new_password（下划线）
  return request.post('/security/reset', {
    reset_token: resetToken,
    new_password: newPassword,
  })
}
