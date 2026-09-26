import request from './request'
import * as mock from './mock'
import { USE_MOCK } from './config'

/**
 * 用户相关接口，全部集中在这里。
 *
 * 页面里只 import 这几个函数，不直接碰 axios。
 * 好处：后端改路径、改参数时，只改这一个文件，四个页面都不用动。
 *
 * 每个函数都是一样的套路：
 *   开 Mock  → 走本地假数据
 *   关 Mock  → 发真请求
 * 两个分支的返回值格式完全一致。
 *
 * ==============================================================
 *  路径一律写「/xxx」，前面自动拼上 /api
 *  （request.js 里 baseURL = API_BASE，默认 '/api'）
 *
 *  接口清单以 C 的《数据库对接说明》（2026-09-27 第 5 节）为准，共 3 个：
 *    POST /api/register   注册
 *    POST /api/login      登录
 *    GET  /api/me         取自己的资料
 *
 *  另外三个是文档里没写、但页面必须要的（前端自己补的，待 C 定案）：
 *    PUT  /api/me         改资料（个人中心「保存修改」用；文档 3 个接口里没有）
 *    GET  /api/health     连通性自检（文档里没有，页面不调用，只用于联调排错）
 *    退出登录              不发请求，前端清掉本地 token 即可
 * ==============================================================
 */

// 注册
// 入参严格按表：{username, password, name, major, grade}
// 返回：表里写的是 data:{token} —— 所以注册成功可以直接算登录
export function register(payload) {
  if (USE_MOCK) return mock.register(payload)
  return request.post('/register', payload)
}

// 登录
// 入参 {username, password}，返回 data:{token}
export function login(payload) {
  if (USE_MOCK) return mock.login(payload)
  return request.post('/login', payload)
}

// 取当前登录用户的信息（靠请求头里的 token 认人）
// 返回 data:{username, name, major, grade}
export function getInfo() {
  if (USE_MOCK) return mock.getInfo()
  return request.get('/me')
}

// 修改个人资料
// 表里没有这个接口，按 GET /api/me 的命名补成 PUT /api/me，需 C 确认
export function updateInfo(payload) {
  if (USE_MOCK) return mock.updateInfo(payload)
  return request.put('/me', payload)
}

// 服务健康检查
// 表里没写入参，返回 data:{service, status}
// 前端页面暂时不用它，留着是为了联调时能一键判断"后端到底通了没"
export function health() {
  if (USE_MOCK) return mock.health()
  return request.get('/health')
}

// 退出登录
// 表里没有这个接口，所以不发请求：token 是存在浏览器本地的，
// 前端自己删掉就等于退出，不需要后端配合。
// （这也是行业里的常见做法，JWT 无状态就是这个意思）
