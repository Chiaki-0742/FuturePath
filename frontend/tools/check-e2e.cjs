/**
 * 端到端自检脚本
 *
 * 作用：自动开一个无头浏览器，真的去点注册和登录按钮，
 *       验证"页面上填表单 -> 发出请求 -> 展示返回结果"这条链路是通的。
 *
 * 为什么要这个？
 *   页面能打开，不代表功能能用。
 *   比如曾经出现过：登录后跳转成功了，但资料加载失败，
 *   页面显示"登录已过期"—— 只看截图完全看不出来。
 *
 * 用法（两个终端）：
 *   终端 1：  npm run dev          ← 保持运行，别关
 *   终端 2：  node tools/check-e2e.cjs
 *
 * 全部通过退出码为 0，有失败为 1，环境没准备好为 2（以后想接自动化测试可以直接用）。
 *
 * 注意：本脚本不会自己启动开发服务器。忘了开的话，脚本会直接告诉你，
 *       而不是刷出一堆 FAIL 让你以为代码写坏了。
 *
 * 如果提示找不到浏览器，用环境变量指定：
 *   set EDGE_PATH=D:\你的浏览器\msedge.exe     （Windows CMD）
 */

const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

const APP_URL = process.env.APP_URL || 'http://localhost:5173'
const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 自动找一个能用的浏览器（Edge / Chrome 都行）
const BROWSERS = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

const BROWSER = BROWSERS.find((p) => {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
})

if (!BROWSER) {
  console.log('找不到浏览器，请用 EDGE_PATH 环境变量指定路径。')
  process.exit(1)
}

const udd = path.join(os.tmpdir(), 'e2e_check_' + Date.now())
let browser
const results = []

const cleanup = () => {
  try {
    if (browser) browser.kill()
  } catch {}
}
process.on('exit', cleanup)

function check(ok, msg) {
  results.push(!!ok)
  console.log('   ' + (ok ? 'PASS' : 'FAIL') + '  ' + msg)
}

function section(title) {
  console.log('='.repeat(64))
  console.log(title)
}

// 环境没准备好的统一退出方式：说清原因，别让人误会成代码写坏了
function bail(title, lines) {
  console.log('='.repeat(64))
  console.log(title)
  for (const l of lines) console.log('   ' + l)
  console.log('')
  console.log('   >>> 自检没有真正跑起来，上面这些 FAIL 不代表代码有问题。')
  cleanup()
  process.exit(2)
}

;(async () => {
  // ---------- 0-a. 先确认开发服务器在跑（在开浏览器之前，快速失败） ----------
  let reachable = false
  for (let i = 0; i < 3 && !reachable; i++) {
    try {
      const r = await fetch(APP_URL + '/', { signal: AbortSignal.timeout(4000) })
      reachable = r.status < 500
    } catch {}
    if (!reachable) await sleep(800)
  }

  if (!reachable) {
    bail('【环境检查】连不上开发服务器', [
      'FAIL  无法访问 ' + APP_URL,
      '',
      '原因：开发服务器没有启动，或者已经关掉了。',
      '解决：先开一个终端运行下面这条命令，看到 VITE ready 就让它一直开着，',
      '      然后回到当前终端重新跑本脚本。',
      '',
      '      npm run dev',
      '',
      '提示：这个命令要单独占一个终端窗口，别和本脚本挤在同一个窗口里。',
    ])
  }

  browser = spawn(
    BROWSER,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + udd,
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  // 等调试端口就绪
  let wsUrl = null
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(500)
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list')
      const list = await r.json()
      const page = list.find((t) => t.type === 'page')
      if (page && page.webSocketDebuggerUrl) wsUrl = page.webSocketDebuggerUrl
    } catch {}
  }
  if (!wsUrl) {
    console.log('浏览器调试端口没起来，脚本退出。')
    return
  }

  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })

  let seq = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }
  const send = (method, params) =>
    new Promise((res) => {
      const id = ++seq
      pending.set(id, res)
      ws.send(JSON.stringify({ id, method, params: params || {} }))
    })

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return r.result && r.result.result ? r.result.result.value : null
  }

  await send('Page.enable')

  const goto = async (hash, wait) => {
    await send('Page.navigate', { url: APP_URL + '/#' + hash })
    await sleep(wait || 2600)
  }
  const bodyText = async () =>
    ((await evaluate('document.body.innerText')) || '').replace(/\s+/g, ' ')
  const currentHash = () => evaluate('location.hash')

  const fill = (pairs) => {
    const lines = pairs
      .map((p) => 'set(' + JSON.stringify(p[0]) + ', ' + JSON.stringify(p[1]) + ');')
      .join('\n    ')
    return evaluate(
      '(() => {\n' +
        '  const set = (sel, val) => {\n' +
        '    const el = document.querySelector(sel)\n' +
        '    if (!el) return\n' +
        '    el.value = val\n' +
        '    el.dispatchEvent(new Event("input", { bubbles: true }))\n' +
        '    el.dispatchEvent(new Event("change", { bubbles: true }))\n' +
        '  }\n    ' +
        lines +
        '\n  return "ok"\n})()'
    )
  }

  const submit = () => evaluate('document.querySelector("button[type=submit]").click()')

  // 把登录状态清掉再进下一个用例。
  // 必须做，否则路由守卫会把"已登录"的人从 /login、/register 直接送回首页，
  // 表单根本渲染不出来，用例会误报成 FAIL。
  const logout = async () => {
    await evaluate('localStorage.removeItem("plan_token")')
    await sleep(150)
  }

  const APP_MARKER = '登录后查看你的个人规划' // 登录页上的一句固定文案，用来判断页面到底渲染出来没有

  const seed = Date.now().toString().slice(-6)

  // ---------- 0-b. 服务通了，但页面真的渲染出来了吗 ----------
  section('【环境检查】')
  await goto('/login')
  const welcome = await bodyText()
  if (!welcome.includes(APP_MARKER)) {
    console.log('   FAIL  页面打开了，但没有内容（拿不到应用界面）')
    console.log('')
    console.log('   >>> 自检没有真正跑起来，所以后面 10 项都没验证，请先解决这里。')
    console.log('   >>> 可能原因：页面里有语法错误，或者 vite 刚启动还在编译。')
    console.log('   >>> 建议：等 5 秒重跑一次；仍然如此就打开 ' + APP_URL + ' 看浏览器控制台的红色报错。')
    ws.close()
    cleanup()
    process.exit(2)
  }
  console.log('   OK  开发服务器可访问（' + APP_URL + '）')
  console.log('   OK  页面已正常渲染')

  // ---------- 1. 注册 ----------
  section('【1】注册：填表 -> 提交')
  await goto('/register')
  await fill([
    ['#username', 'e2e' + seed],
    ['#password', 'abc123'],
    ['#confirm', 'abc123'],
    ['#name', '自检同学'],
    ['#major', '计算机科学与技术'],
    ['#grade', '大一'],
  ])
  await submit()
  await sleep(2600)
  let text = await bodyText()
  let hash = await currentHash()
  console.log('   跳转后:', hash)
  // 约定表里注册接口返回 data:{token}，所以正常情况注册完就已经是登录状态了
  check(hash === '#/', '注册成功后自动登录并进入首页')
  check(text.includes('你好，e2e' + seed), '注册后首页显示新账号')

  // ---------- 2. 前端校验 ----------
  section('【2】注册：两次密码不一致')
  await logout()
  await goto('/register')
  await fill([
    ['#username', 'e2e' + seed + 'b'],
    ['#password', 'abc123'],
    ['#confirm', 'xyz999'],
    ['#name', '自检同学'],
    ['#major', '计算机科学与技术'],
    ['#grade', '大一'],
  ])
  await submit()
  await sleep(900)
  text = await bodyText()
  check(text.includes('两次输入的密码不一致'), '前端校验拦住了不一致的密码')

  // ---------- 3. 后端错误展示 ----------
  section('【3】注册：用户名已存在')
  await logout()
  await goto('/register')
  await fill([
    ['#username', 'test'],
    ['#password', '123456'],
    ['#confirm', '123456'],
    ['#name', '重名同学'],
    ['#major', '软件工程'],
    ['#grade', '大二'],
  ])
  await submit()
  await sleep(2200)
  text = await bodyText()
  check(text.includes('用户名已存在'), '后端返回的错误正确显示到页面上')

  // ---------- 4. 登录 ----------
  section('【4】登录：test / 123456')
  await logout()
  await goto('/login')
  await fill([
    ['#username', 'test'],
    ['#password', '123456'],
  ])
  await submit()
  await sleep(3200)
  text = await bodyText()
  hash = await currentHash()
  console.log('   登录后跳转到:', hash)
  check(hash === '#/', '登录成功后进入首页')
  check(text.includes('你好，test'), '首页显示当前用户名')
  check(text.includes('账号信息'), '用户资料通过接口加载成功')
  check(text.includes('测试同学'), '资料字段按约定渲染（姓名）')

  // ---------- 5. 个人中心 ----------
  section('【5】个人中心（已登录）')
  await goto('/profile')
  await sleep(1800)
  text = await bodyText()
  check(text.includes('个人中心'), '页面正常打开')
  check(text.includes('保存修改'), '资料表单渲染完整')
  check(text.includes('专业') && text.includes('年级'), '表单字段与接口约定一致')

  // ---------- 6. 登录守卫 ----------
  section('【6】清掉 token 后访问个人中心')
  await evaluate('localStorage.removeItem("plan_token")')
  await goto('/profile')
  text = await bodyText()
  check(text.includes('登录后查看你的个人规划'), '被登录守卫拦回登录页')
  check(!text.includes('退出登录') && text.includes(APP_MARKER), '顶栏同步切换成未登录状态')

  // ---------- 汇总 ----------
  section('汇总')
  const failed = results.filter((r) => !r).length
  console.log('   共 ' + results.length + ' 项，通过 ' + (results.length - failed) + ' 项，失败 ' + failed + ' 项')
  console.log(failed === 0 ? '   >>> 全部通过' : '   >>> 有失败项，请看上面标 FAIL 的行')

  ws.close()
  cleanup()
  process.exit(failed === 0 ? 0 : 1)
})().catch((e) => {
  console.log('脚本异常:', e && e.message)
  cleanup()
  process.exit(1)
})
