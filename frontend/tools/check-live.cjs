/**
 * 真后端联调自检（Live 模式）
 *
 * 和 check-e2e.cjs 的区别：
 *   check-e2e.cjs  —— 验证页面本身没坏（用的是模拟数据，不需要后端）
 *   check-live.cjs —— 验证"前端 + 同学 A 的真后端"接得上（必须两个服务都开着）
 *
 * 它会真的去注册一个随机账号，然后比对"页面上显示的东西"和
 * "直接从后端接口拿到的数据"是否一致。
 * 因为账号名带时间戳，模拟数据里绝不可能有它 ——
 * 所以只要能显示出来，就只可能是真后端给的，不存在"其实是 mock 蒙对了"。
 *
 * 用法（两个终端）：
 *   终端 1：  cd backend  &&  .\venv\Scripts\python.exe run.py     ← 后端
 *   终端 2：  cd frontend &&  npm run dev                          ← 前端
 *   终端 3：  cd frontend &&  node tools/check-live.cjs
 *
 * 前置条件：frontend/.env 里 VITE_USE_MOCK=false（否则测的还是模拟数据）
 *
 * 退出码：全部通过 0 / 有失败 1 / 环境没准备好 2
 */

const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

const APP_URL = process.env.APP_URL || 'http://localhost:5173'
const API_URL = process.env.API_URL || 'http://127.0.0.1:5000'
const PORT = 9334
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

let browser
const results = []
const notes = []

const cleanup = () => {
  try {
    if (browser) browser.kill()
  } catch {}
}
process.on('exit', cleanup)

const check = (ok, msg) => {
  results.push(!!ok)
  console.log('   ' + (ok ? 'PASS' : 'FAIL') + '  ' + msg)
}

// 已知缺口 / 补充信息：如实报告，但不影响退出码
const note = (msg) => {
  notes.push(msg)
  console.log('   NOTE  ' + msg)
}

const section = (title) => {
  console.log('='.repeat(64))
  console.log(title)
}

const bail = (title, lines) => {
  console.log('='.repeat(64))
  console.log(title)
  for (const l of lines) console.log('   ' + l)
  console.log('')
  console.log('   >>> 自检没有真正跑起来，上面的 FAIL 不代表代码有问题。')
  cleanup()
  process.exit(2)
}

;(async () => {
  // ---------- 环境预检 1：.env 是不是真的切到后端了 ----------
  section('【环境检查】')
  const envPath = path.join(__dirname, '..', '.env')
  let envText = ''
  try {
    envText = fs.readFileSync(envPath, 'utf8')
  } catch {}

  const mockOff = /^\s*VITE_USE_MOCK\s*=\s*false\s*$/m.test(envText)
  if (!mockOff) {
    bail('【环境检查】当前前端还开着模拟数据模式', [
      'FAIL  frontend/.env 里没有 VITE_USE_MOCK=false',
      '',
      '原因：这个脚本是用来测真后端的，但现在前端走的是本地模拟数据，测了也没有意义。',
      '解决：把 frontend/.env 里那一行改成 VITE_USE_MOCK=false，',
      '      然后重启 npm run dev（配置文件不热更新），再重跑本脚本。',
    ])
  }
  console.log('   OK  前端已切到真后端模式（VITE_USE_MOCK=false）')

  // ---------- 环境预检 2：后端活着吗 ----------
  let health = null
  try {
    const r = await fetch(API_URL + '/api/health', { signal: AbortSignal.timeout(5000) })
    health = await r.json()
  } catch {}

  if (!health || health.code !== 0) {
    bail('【环境检查】连不上后端', [
      'FAIL  无法访问 ' + API_URL + '/api/health',
      '',
      '原因：Flask 后端没有启动。',
      '解决：另开一个终端运行下面这条命令，看到 Running on http://127.0.0.1:5000 就让它开着：',
      '',
      '      cd D:\\Code\\FuturePath\\backend',
      '      .\\venv\\Scripts\\python.exe run.py',
    ])
  }
  console.log('   OK  后端在线（' + API_URL + '）')

  // ---------- 环境预检 3：前端页面能打开吗 ----------
  let reachable = false
  for (let i = 0; i < 3 && !reachable; i++) {
    try {
      const r = await fetch(APP_URL + '/', { signal: AbortSignal.timeout(4000) })
      reachable = r.status < 500
    } catch {}
    if (!reachable) await sleep(800)
  }
  if (!reachable) {
    bail('【环境检查】连不上前端页面', [
      'FAIL  无法访问 ' + APP_URL,
      '',
      '原因：npm run dev 没有启动。',
      '解决：另开一个终端：cd D:\\Code\\FuturePath\\frontend  →  npm run dev',
    ])
  }
  console.log('   OK  前端页面可访问（' + APP_URL + '）')

  if (!BROWSER) bail('【环境检查】找不到浏览器', ['请用 EDGE_PATH 环境变量指定浏览器路径。'])

  // ---------- 启动无头浏览器 ----------
  const udd = path.join(os.tmpdir(), 'live_check_' + Date.now())
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
  if (!wsUrl) bail('【环境检查】浏览器调试端口没起来', ['脚本退出，请重试一次。'])

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
    // ?r=时间戳 不能删：两次导航到完全相同的地址，浏览器不会真的重新加载，
    // 上一次填的表单会残留，导致断言假失败。
    const url = APP_URL + '/?r=' + Date.now() + '#' + hash
    await send('Page.navigate', { url })
    await sleep(wait || 3000)
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
        '  const isField = (el) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)\n' +
        '  const set = (sel, val) => {\n' +
        '    let el = document.querySelector(sel)\n' +
        '    if (el && !isField(el)) el = el.querySelector("input, textarea, select")\n' +
        '    if (!isField(el)) return\n' +
        '    el.value = val\n' +
        '    el.dispatchEvent(new Event("input", { bubbles: true }))\n' +
        '    el.dispatchEvent(new Event("change", { bubbles: true }))\n' +
        '  }\n    ' +
        lines +
        '\n  return "ok"\n})()'
    )
  }

  const submit = async () => {
    await evaluate('document.querySelector("button[type=submit]").click()')
    await sleep(900)
  }

  const getToken = () => evaluate('localStorage.getItem("plan_token")')

  // 读取个人中心表单里当前的值。
  // ⚠️ 必须读 input 的 .value，不能用 document.body.innerText 去找 ——
  //    输入框里的文字不是文本节点，innerText 里根本没有它。
  //    （这个坑本脚本第一版真踩过：数据显示是对的，却被断言成 FAIL。）
  const profileFields = () =>
    evaluate(
      '(() => {\n' +
        '  const q = (sel) => {\n' +
        '    const el = document.querySelector(sel)\n' +
        '    if (!el) return null\n' +
        '    const f = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)\n' +
        '      ? el\n' +
        '      : el.querySelector("input, textarea")\n' +
        '    return f ? f.value : null\n' +
        '  }\n' +
        '  return { name: q("#name"), major: q("#major"), grade: q("#grade") }\n' +
        '})()'
    )

  const clearToken = async () => {
    await evaluate('localStorage.removeItem("plan_token")')
    await sleep(150)
  }

  const APP_MARKER = '登录后查看你的个人规划'

  // 随机账号名：带时间戳，模拟数据里绝不可能存在
  const username = 'live' + Date.now().toString().slice(-8)
  const password = 'abc123'
  const realname = '联调同学'
  const major = '软件工程'

  // ---------- 1. 页面注册（走真后端） ----------
  section('【1】注册（真后端）：填表 -> 提交 -> 应自动登录进首页')
  await clearToken()
  await goto('/register')
  await fill([
    ['#username', username],
    ['#password', password],
    ['#confirm', password],
    ['#name', realname],
    ['#major', major],
  ])
  await submit()
  await sleep(3200)

  let text = await bodyText()
  let hash = await currentHash()
  console.log('   注册的账号:', username)
  console.log('   跳转后:', hash)

  const token = await getToken()
  check(!!token && token.length > 10, '后端返回了 token 并且前端存下来了')
  check(hash === '#/', '注册成功后自动进入首页')
  check(text.includes(username), '首页显示了刚注册的用户名（' + username + '）')

  // ---------- 2. 与后端直接对账 ----------
  section('【2】拿页面里的 token 直接问后端，核对数据来源')
  let me = null
  if (token) {
    try {
      const r = await fetch(API_URL + '/api/me', {
        headers: { Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(6000),
      })
      me = await r.json()
    } catch {}
  }

  if (!me) {
    check(false, '用页面里的 token 调 GET /api/me 拿不到数据')
  } else {
    console.log('   后端返回:', JSON.stringify(me.data))
    check(me.code === 0, 'GET /api/me 用这个 token 能拿到数据（说明请求头格式两端一致）')
    check(me.data && me.data.username === username, '后端返回的用户名和刚注册的一致')
    check(me.data && me.data.name === realname, '后端存下了注册时填的姓名（' + realname + '）')
    check(me.data && me.data.major === major, '后端存下了注册时填的专业（' + major + '）')
  }

  // ---------- 3. 个人中心显示真实资料 ----------
  section('【3】个人中心：表单里预填的是后端的数据')
  await goto('/profile')
  await sleep(2200)
  text = await bodyText()
  check(text.includes('个人中心'), '页面正常打开')
  check(text.includes('保存修改'), '表单渲染完整')

  const profileValues = await profileFields()
  console.log('   表单里预填的值:', JSON.stringify(profileValues))
  check(!!profileValues && profileValues.name === realname, '姓名栏预填的是后端返回的「' + realname + '」')
  check(!!profileValues && profileValues.major === major, '专业栏预填的是后端返回的「' + major + '」')

  // ---------- 4. 刷新后仍保持登录 ----------
  section('【4】整页刷新后，登录状态还在吗')
  await goto('/profile') // 相当于重新加载一次页面
  await sleep(2000)
  hash = await currentHash()
  const profileAfterReload = await profileFields()
  console.log('   刷新后表单里的值:', JSON.stringify(profileAfterReload))
  check(hash === '#/profile', '刷新后没有被踢回登录页')
  check(
    !!profileAfterReload && profileAfterReload.name === realname,
    '刷新后资料重新从后端加载出来了（姓名还在）'
  )

  // ---------- 5. 退出登录 ----------
  section('【5】退出登录')
  await evaluate(
    '(() => {\n' +
      '  const b = Array.from(document.querySelectorAll("button")).find(function (x) { return x.innerText.trim() === "退出登录" })\n' +
      '  if (b) b.click()\n' +
      '  return !!b\n' +
      '})()'
  )
  await sleep(1800)
  text = await bodyText()
  hash = await currentHash()
  check(hash === '#/login' || text.includes(APP_MARKER), '退出后回到登录页')
  check(!(await getToken()), '本地 token 已清掉')

  // ---------- 6. 用刚注册的账号重新登录 ----------
  section('【6】重新登录：' + username)
  await goto('/login')
  await fill([
    ['#username', username],
    ['#password', password],
  ])
  await submit()
  await sleep(3400)
  text = await bodyText()
  hash = await currentHash()
  check(hash === '#/', '登录成功并进入首页')
  check(text.includes(username), '首页显示了登录的账号')
  check(text.includes(realname), '资料是从后端 /api/me 拉到的（显示了 ' + realname + '）')

  // ---------- 7. 密码错误时展示后端的报错 ----------
  section('【7】密码输错，看后端返回的提示有没有显示出来')
  await clearToken()
  await goto('/login')
  await fill([
    ['#username', username],
    ['#password', 'wrong999'],
  ])
  await submit()
  await sleep(3000)
  text = await bodyText()
  check(text.includes('用户名或密码错误'), '后端返回的「用户名或密码错误」显示在页面上')
  check((await currentHash()) !== '#/', '没有误放行进入首页')

  // ---------- 8. 已知缺口探测（不计入成败） ----------
  section('【8】补充探测：个人中心的「保存修改」有接口吗')
  let putStatus = 0
  let putBody = ''
  try {
    const r = await fetch(API_URL + '/api/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ name: realname, major, grade: '大一' }),
      signal: AbortSignal.timeout(6000),
    })
    putStatus = r.status
    putBody = (await r.text()).slice(0, 120)
  } catch (e) {
    putBody = String(e && e.message)
  }

  console.log('   PUT /api/me -> HTTP ' + (putStatus || '(连不上)'))
  if (putStatus === 405) {
    note('后端还没有 PUT /api/me —— 个人中心的「保存修改」在真后端下会失败（HTTP 405）。')
    note('这是同学 A 要补的接口，补上后本脚本这一项会自动变绿。')
  } else if (putStatus === 200) {
    note('PUT /api/me 已经存在了（HTTP 200），个人中心的「保存修改」可以正常用。')
  } else {
    note('PUT /api/me 返回 HTTP ' + putStatus + '：' + putBody.replace(/\s+/g, ' '))
  }

  // ---------- 汇总 ----------
  section('汇总')
  const failed = results.filter((r) => !r).length
  console.log('   共 ' + results.length + ' 项，通过 ' + (results.length - failed) + ' 项，失败 ' + failed + ' 项')
  console.log('   ' + (notes.length ? notes.length + ' 条补充说明（见上面带 NOTE 的行）' : '无补充说明'))
  console.log('   >>> ' + (failed === 0 ? '前后端联调通畅' : '有失败项，请看上面标 FAIL 的行'))
  console.log('')
  console.log('   本次在后端数据库里创建了 1 个测试账号：' + username)
  console.log('   （真注册会真的写库，这是正常的；想清理可以直接删掉本地的开发库文件）')

  ws.close()
  cleanup()
  process.exit(failed === 0 ? 0 : 1)
})().catch((e) => {
  console.log('脚本异常:', e && e.message)
  cleanup()
  process.exit(1)
})
