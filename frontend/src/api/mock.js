import { getToken } from '../utils/token'

/**
 * 本地 Mock 数据。
 *
 * 作用：后端还没写好时，让四个页面照样能跑通，
 *       而且能顺手测出"用户名已存在"这种真后端很难造的错误。
 *
 * 数据存在浏览器的 localStorage 里，所以刷新页面账号还在。
 * 想清空重来：浏览器 F12 → Application → Local Storage → 删掉 plan_mock_users
 *
 * 【不加密、不上传、只在本机】，纯粹是开发期的替身，不要当成正式实现。
 *
 * ------------------------------------------------------------------
 * 一、返回值契约（很重要，踩过坑）：
 *
 *   真实后端返回的是 { code, msg, data }，
 *   但 api/request.js 的响应拦截器会【自动解包】，页面拿到的已经是 data 了。
 *
 *   所以这里的函数也必须【直接返回 data】，
 *   两条路径的返回值才会完全一致，页面代码才不用改。
 *   （曾经这里返回了完整的 {code,msg,data}，结果 data.token 取出来是
 *     undefined，登录后一直提示"登录已过期"。）
 *
 * ------------------------------------------------------------------
 * 二、字段契约：以 C 的《数据库对接说明》（2026-09-27）为准。
 *
 *   用户对象就这四个字段，多一个都不返回：
 *     { username, name, major, grade }
 *
 *   该文档第 2 节给出了 user 表的建表语句（7 列）：
 *     id / username / password_hash / name / major / grade / created_at
 *   —— 确认【没有 email / phone】。
 *   所以这里不存、不返回这两个字段，页面上的输入框也早已删掉，
 *   免得出现"填了却存不进去"的假象。
 * ------------------------------------------------------------------
 */

const USERS_KEY = 'plan_mock_users'
const DELAY = 300 // 模拟网络延迟，让 loading 状态看得见

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
  } catch {
    /* 忽略 */
  }
}

// 只把约定里的四个字段返回给页面（password 是绝对不能出去的）
function profile(user) {
  return {
    username: user.username,
    name: user.name,
    major: user.major,
    grade: user.grade,
  }
}

// 预置一个测试账号，一装上就能登录
function seed() {
  const users = readUsers()
  if (Object.keys(users).length > 0) return
  users['test'] = {
    id: 1,
    username: 'test',
    password: '123456',
    name: '测试同学',
    major: '计算机科学与技术',
    grade: '大一',
  }
  writeUsers(users)
}
seed()

function makeToken(username) {
  return `mock-token.${username}.${Date.now()}`
}

function currentUsername() {
  const parts = getToken().split('.')
  return parts[0] === 'mock-token' ? parts[1] : ''
}

// ---------------------------------------------------------------
// 下面几个函数：成功时返回 data，失败时 throw —— 和真接口表现一致
//
// 报错文案故意跟 C《数据库对接说明》第 5 节的错误码表保持一致：
//   1001 → 参数缺失或格式错误     1002 → "用户名已存在"
//   1003 → "用户名或密码错误"     1004 → "用户不存在"
// 这样页面无论连 mock 还是连真后端，用户看到的字都一样。
//
// ⚠️ 错误码含义以 C 9-27 那份新文档为准。
//    9-26 的《1.4 接口约定》里 1003 才是"用户名已存在"，两版不一致，
//    但前端不看错误码、只显示 msg，所以不受影响。
// ---------------------------------------------------------------

// 注册。入参严格按 C 的文档：{username, password, name, major, grade}
//
// ⚠️ "注册返回什么"两份文档打架了：
//   9-26《1.4 接口约定》表 → data:{token}（注册即登录）
//   9-27《数据库对接说明》示例代码 → data: null（注册完要手动登一次）
//   前端两种都兼容（store 拿到 token 就登，没有就跳登录页并预填用户名）。
//   这里先按"返回 token"模拟；若 C 确认不返回，把这行改成 return null，
//   页面行为会自动变成"注册成功 → 跳登录页"，其他代码一行都不用动。
export async function register({ username, password, name = '', major = '', grade = '' }) {
  await sleep(DELAY)

  const users = readUsers()
  if (users[username]) {
    throw new Error('用户名已存在') // 对应 1002
  }

  users[username] = {
    id: Date.now(),
    username,
    password, // 注意：mock 才敢这么存，真后端必须加密
    name,
    major,
    grade,
  }
  writeUsers(users)

  return { token: makeToken(username) }
}

export async function login({ username, password }) {
  await sleep(DELAY)

  const users = readUsers()
  const user = users[username]

  // 故意不区分"用户不存在"和"密码错误"，这是安全惯例
  if (!user || user.password !== password) {
    throw new Error('用户名或密码错误') // 对应 1003
  }

  // login 的返回就一个 token（资料另外用 GET /api/me 拿）。
  // ⚠️ C 的文档只写了 login 的 SQL、没写返回结构，这一点仍需他确认。
  return { token: makeToken(username) }
}

export async function getInfo() {
  await sleep(DELAY)

  const username = currentUsername()
  if (!username) {
    throw new Error('登录已过期，请重新登录') // 对应 401（未登录或 Token 无效）
  }

  const user = readUsers()[username]
  if (!user) {
    throw new Error('用户不存在，请重新登录') // 对应 1004
  }

  return profile(user)
}

export async function updateInfo(payload) {
  await sleep(DELAY)

  const username = currentUsername()
  if (!username) {
    throw new Error('登录已过期，请重新登录')
  }

  const users = readUsers()
  if (!users[username]) {
    throw new Error('用户不存在，请重新登录') // 对应 1004
  }

  // 只允许改这三个，用户名和密码走别的流程
  const editable = ['name', 'major', 'grade']
  editable.forEach((key) => {
    if (key in payload) users[username][key] = payload[key]
  })
  writeUsers(users)

  return profile(users[username])
}

// 服务健康检查。页面暂时不用，联调时手动调一下能确认后端通没通
export async function health() {
  await sleep(120)
  return { service: 'frontend-mock', status: 'ok' }
}
