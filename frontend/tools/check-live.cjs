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

  // 按文字点一个可见的选项（问卷三屏都在 DOM 里，只有一屏可见，必须先筛掉藏起来的）
  const clickOption = async (label) => {
    const found = await evaluate(
      '(() => {\n' +
        '  var items = []\n' +
        '  Array.from(document.querySelectorAll(".el-form-item"))\n' +
        '    .filter(function (el) { return el.offsetParent !== null })\n' +
        '    .forEach(function (item) {\n' +
        '      Array.from(item.querySelectorAll(".el-radio, .el-checkbox")).forEach(function (x) { items.push(x) })\n' +
        '    })\n' +
        '  var target = items.find(function (el) { return el.innerText.replace(/\\s+/g, "") === ' +
        JSON.stringify(label) +
        ' })\n' +
        '  if (!target) return false\n' +
        '  target.click()\n' +
        '  return true\n' +
        '})()'
    )
    await sleep(170)
    return found
  }

  // 按文字点一个可见的按钮（"下一步""提交问卷"这类）
  const clickButton = async (label) => {
    const found = await evaluate(
      '(() => {\n' +
        '  var btns = Array.from(document.querySelectorAll("button")).filter(function (b) {\n' +
        '    return b.offsetParent !== null && b.innerText.replace(/\\s+/g, "") === ' +
        JSON.stringify(label) +
        ' })\n' +
        '  if (!btns.length) return false\n' +
        '  btns[0].click()\n' +
        '  return true\n' +
        '})()'
    )
    await sleep(700)
    return found
  }

  // 读案例卡片上的方向标签（用来判断"筛完之后是不是全是这个方向"）
  const caseDirections = async () =>
    (await evaluate(
      'Array.from(document.querySelectorAll(".chip--direction")).map(function (e) { return e.innerText.trim() })'
    )) || []

  // 当前高亮的筛选标签是哪个
  const activeFilter = async () =>
    (await evaluate(
      '(() => { var e = document.querySelector(".filter--on"); return e ? e.innerText.trim() : "" })()'
    )) || ''

  // 页面【真实发出】的那条 /api/cases 请求的地址（已解码成中文，方便读）。
  //
  // 为什么不用"看页面显示什么"来判断参数？因为显示的东西是后端的计算结果，
  // 中间隔了一层 —— 参数传错过、恰好碰上同样的结果，就看不出来。
  // 抓请求地址是唯一能直接看到"前端到底把什么发给了后端"的办法。
  // performance 记录会在页面导航时重置，所以每次 goto 之后读到的都是这一轮的请求。
  const lastCaseRequest = async () =>
    (await evaluate(
      '(() => {\n' +
        '  var es = performance.getEntriesByType("resource").filter(function (e) {\n' +
        '    return e.name.indexOf("/api/cases?") >= 0\n' +
        '  })\n' +
        '  if (!es.length) return ""\n' +
        '  try { return decodeURIComponent(es[es.length - 1].name) } catch (e) { return es[es.length - 1].name }\n' +
        '})()'
    )) || ''

  // ---- 案例详情页专用 ----
  //
  // 点一张案例卡片。整张卡片是个 <a class="case">，里面包着标题/画像/概述，
  // 所以只能按"文字包含"来找，不能像按钮那样精确匹配。
  const clickCaseCard = async (titlePart) => {
    const found = await evaluate(
      '(() => {\n' +
        '  var els = Array.from(document.querySelectorAll("a.case"))\n' +
        '  var t = els.find(function (a) { return a.innerText.indexOf(' +
        JSON.stringify(titlePart) +
        ') >= 0 })\n' +
        '  if (!t) return false\n' +
        '  t.click()\n' +
        '  return true\n' +
        '})()'
    )
    await sleep(600)
    return found
  }

  // 读某个元素的背景色（"关键节点很醒目"这件事要量出来，不靠肉眼）
  const bgColor = async (sel) =>
    (await evaluate(
      '(() => { var e = document.querySelector(' +
        JSON.stringify(sel) +
        '); return e ? getComputedStyle(e).backgroundColor : "" })()'
    )) || ''

  // 橙色系判断：rgb(217, 136, 23) 的特征是 红 > 绿 > 蓝 且拉得开
  const isOrangeColor = (c) => {
    const m = String(c).match(/[\d.]+/g)
    if (!m) return false
    const [r, g, b] = m.map(Number)
    return r > 180 && r > g && g > b + 40
  }

  const APP_MARKER = '登录后查看你的个人规划'

  // 随机账号名：带时间戳，模拟数据里绝不可能存在
  const username = 'live' + Date.now().toString().slice(-8)
  const password = 'abc123'
  const realname = '联调同学'
  const major = '软件工程'

  // ---------- 1. 页面注册（走真后端） ----------
  section('【1】注册（真后端）-> 自动进问卷 -> 填完提交 -> 首页显示方向')
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
  // 2026-10-02 起：新注册的用户不再直接进首页，先被新手引导带去填问卷
  check(hash === '#/survey', '注册成功后先进入问卷页（新手引导）')
  check(text.includes('第 1 步 / 共 3 步'), '问卷页正常渲染（进度显示第几步）')

  // 问卷接口的两种情况这一段都能过：
  //   接口还没上线 -> 题目回落到内置题库、提交回落到本地保存（页面不白屏）
  //   接口已上线   -> 直接用后端返回的题目（2026-10-04 已上线，现在走的就是这条）
  check(text.includes('未来方向'), '问卷题目渲染出来了（接口通了走接口，没通走内置题库）')

  check(await clickOption('考研'), '第 1 屏选中「考研」')
  await clickButton('下一步')
  text = await bodyText()
  check(text.includes('第 2 步 / 共 3 步'), '进入第 2 屏（当前现状）')

  // B 组 6 题：年级 / 专业 / 学校 / 成绩 / 英语 / 经历（多选）
  const statusPicks = ['大三', '理工类', '普通一本', '前30%', '已过六级', '实习']
  let pickedAll = true
  for (const opt of statusPicks) {
    if (!(await clickOption(opt))) {
      pickedAll = false
      console.log('   ⚠️ 页面上没找到这个选项:', opt)
    }
  }
  check(pickedAll, '第 2 屏 6 道题都选上了')

  await clickButton('下一步')
  check(await clickOption('具体怎么准备'), '第 3 屏选中一个想了解的问题')
  await clickButton('提交问卷')
  await sleep(2800)

  hash = await currentHash()
  text = await bodyText()
  check(hash === '#/', '提交问卷后进入首页')
  const dir = await evaluate(
    '(() => { var el = document.querySelector(".direction"); return el ? el.innerText.trim() : "" })()'
  )
  check(dir === '考研', '首页显示问卷里选的方向（真后端下也能显示）')
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
    // 这条是给【9】锁定前提用的：账号资料里的年级是注册时的默认值「大一」，
    // 而问卷里填的是「大三」—— 两个值不同，【9】才验得出案例匹配用的是哪一个。
    // 哪天注册默认值改成「大三」了，这条会先失败，提醒"区分度没了"，
    // 而不是让【9】悄悄变成永远通过。
    check(
      me.data && me.data.grade === '大一',
      '账号资料里的年级是注册时的「大一」（与问卷里填的「大三」不同）'
    )
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

  // ---------- 8. 个人中心「保存修改」真的能存进后端吗 ----------
  // 2026-09-29 升级：A 补上 PUT /api/me 之后，这里从"探测接口在不在"
  // 改成"真的在页面上改一遍再点保存"。只探测接口存在是不够的 ——
  // 接口在、但页面按钮点不通或者字段对不上，照样是坏的。
  section('【8】个人中心改资料 -> 点「保存修改」-> 后端真的变了吗')
  // 第 7 项为了测错密码把 token 清了，这里先重新登录
  await goto('/login')
  await fill([
    ['#username', username],
    ['#password', password],
  ])
  await submit()
  await sleep(3400)

  const newName = '改过的名字'
  const newMajor = '计算机科学与技术'

  await goto('/profile')
  await sleep(2200)
  await fill([
    ['#name', newName],
    ['#major', newMajor],
  ])

  // 点「保存修改」。el-button 渲染出来就是 <button>，
  // 文案会在「保存修改」和「保存中…」之间切换，两个都匹配。
  const clickedSave = await evaluate(
    '(() => {\n' +
      '  const b = Array.from(document.querySelectorAll("button")).find(function (x) {\n' +
      '    const t = (x.innerText || "").trim()\n' +
      '    return t === "保存修改" || t === "保存中…"\n' +
      '  })\n' +
      '  if (b) b.click()\n' +
      '  return !!b\n' +
      '})()'
  )
  await sleep(2200)

  const saveText = await bodyText()
  check(clickedSave === true, '找到了「保存修改」按钮并点了它')
  check(saveText.includes('保存成功'), '页面显示了「保存成功」的提示')

  // 不信页面提示，直接问后端是不是真的写进去了
  let meAfter = null
  try {
    const r = await fetch(API_URL + '/api/me', {
      headers: { Authorization: 'Bearer ' + (await getToken()) },
      signal: AbortSignal.timeout(6000),
    })
    meAfter = await r.json()
  } catch {}
  console.log('   改完后端返回:', meAfter ? JSON.stringify(meAfter.data) : '(拿不到)')
  check(
    !!meAfter && meAfter.code === 0 && meAfter.data.name === newName,
    '后端 /api/me 里的姓名真的变成了「' + newName + '」'
  )
  check(
    !!meAfter && meAfter.data.major === newMajor,
    '后端 /api/me 里的专业真的变成了「' + newMajor + '」'
  )

  // 再整页刷新一次，看后端存的值能不能重新读回来（闭环）
  await goto('/profile')
  await sleep(2200)
  const profileAfterSave = await profileFields()
  console.log('   刷新后表单里的值:', JSON.stringify(profileAfterSave))
  check(
    !!profileAfterSave && profileAfterSave.name === newName,
    '刷新页面后显示的还是改后的姓名（数据确实落库了）'
  )

  // ---------- 9. 案例列表页（真后端） ----------
  // 这一节是补上的：之前案例接口没上线，没能验证；现在接口通了，
  // 重点验两件事 —— ① 数据真的来自后端 ② 冷门方向的兜底文案不能说错。
  section('【9】案例列表页（真后端）：方向筛选 + 冷门方向的兜底')
  await goto('/cases', 2600)
  let ctext = await bodyText()
  let cdirs = await caseDirections()
  check(cdirs.length > 0, '案例从后端加载出来了（' + cdirs.length + ' 条）')

  // ★ 本次修复的验证点：匹配用的年级必须取【问卷里填的】，不能取账号资料里的。
  //   后端 case.py 的"方向+年级"第一层匹配要的就是问卷年级；前端要是把
  //   user.grade（注册时填的"大一"）传过去，等于用错的值把后端正确的兜底覆盖掉。
  //   这里直接看页面真实发出的那条请求 —— 比看页面显示什么更硬，
  //   因为显示是后端算出来的，参数传错也可能碰巧显示对。
  const caseReq = await lastCaseRequest()
  check(caseReq.indexOf('/api/cases?') >= 0, '抓到了页面真实发出的案例请求（' + caseReq + '）')
  // 注意：lastCaseRequest 返回的地址已经 decodeURIComponent 过了，所以这里直接写中文
  check(caseReq.includes('grade=大三'), '请求里带的年级是【问卷里填的】「大三」')
  check(!caseReq.includes('grade=大一'), '没有把账号资料里的「大一」传过去（注册时填的那个）')
  check(caseReq.includes('direction=考研'), '方向也照常按问卷里的「考研」筛（没被这次改动带坏）')
  // 这条是"数据确实来自后端"的硬证据：接口若没通，页面会多显示一行
  // "案例接口还没上线，当前展示的是内置案例库"，不出现就说明 synced = true
  check(
    !ctext.includes('案例接口还没上线'),
    '数据来自后端（没出现"接口还没上线"的降级提示）'
  )
  check((await activeFilter()) === '考研', '进页面时按问卷里的方向「考研」筛好了')
  check(
    cdirs.length === 3 && cdirs.every((d) => d === '考研'),
    '筛完 3 条，且【全部】都是考研（当前：' + [...new Set(cdirs)].join(',') + '）'
  )

  // C 在 2026-10-01 修了那个数据不一致（问卷 A 组加「保研」、案例扩到 18 条、
  // 6 个方向各 3 条）。分两层验证：
  //
  //   ① 页面层：每个方向点进去都得有案例、方向不能串。
  //      ⚠️ 这里条数会【少于 3】—— 因为页面总会带上问卷里的年级（大三），
  //      而后端第一层是「方向 + 年级」精确匹配，命中了就不再往下放宽。
  //      比如「就业」3 条里只有 1 条是大三的，页面就只显示那 1 条 —— 这是设计如此，
  //      不是 bug。所以页面层只断言"≥1 条且方向一致"（不白页、不串方向）。
  //
  //   ② 数据层：确认每个方向真的有 3 条。要看到全部 3 条得绕开"年级"这一层 ——
  //      传一个案例表里不存在的年级，让第一层落空、落到第二层（只按方向给），
  //      拿到的就是这个方向的全部案例。这条验的是 C 补的数据到位没有。
  const LIVE_DIR_NAMES = ['考研', '保研', '就业', '考公', '留学', '创业']
  const liveDirCounts = []
  const liveDirProblems = []
  for (const name of LIVE_DIR_NAMES) {
    await goto('/cases?direction=' + encodeURIComponent(name), 2500)
    const liveDs = await caseDirections()
    liveDirCounts.push(name + ':' + liveDs.length)
    if (!(liveDs.length >= 1 && liveDs.every((d) => d === name))) {
      liveDirProblems.push(
        name + ' 得到 ' + liveDs.length + ' 条[' + [...new Set(liveDs)].join('/') + ']'
      )
    }
  }
  check(
    liveDirProblems.length === 0,
    '6 个方向点进去都有案例、方向不串（页面显示 ' + liveDirCounts.join(' ') + '）' +
      (liveDirProblems.length ? ' —— 异常：' + liveDirProblems.join('；') : '')
  )

  const dirTotals = await evaluate(
    '(async () => {\n' +
      '  const token = localStorage.getItem("plan_token")\n' +
      '  const names = [' +
      LIVE_DIR_NAMES.map((n) => '"' + n + '"').join(',') +
      ']\n' +
      '  const out = []\n' +
      '  for (const n of names) {\n' +
      '    const r = await fetch("/api/cases?direction=" + encodeURIComponent(n) + "&grade=__none__&limit=50", {\n' +
      '      headers: { Authorization: "Bearer " + token }\n' +
      '    })\n' +
      '    const j = await r.json()\n' +
      '    out.push(n + ":" + ((j.data && j.data.list) ? j.data.list.length : -1))\n' +
      '  }\n' +
      '  return out.join(" ")\n' +
      '})()'
  )
  check(
    dirTotals === LIVE_DIR_NAMES.map((n) => n + ':3').join(' '),
    '每个方向确实各有 3 条案例（C 补的数据到位了）：' + dirTotals
  )

  // ★ 「全部」必须真的是全部 —— 这条是 2026-10-09 实测发现的坑：
  //   前端以前点「全部」是传空的 direction，而后端 case.py 有一句
  //   `if not direction and ans: direction = ans.direction`（"你没说方向就用你问卷里的"），
  //   于是用户点「全部」只看到自己方向的 3 条，页面上还什么提示都没有 ——
  //   "全部"看起来就真的只有 3 条。修法是把「全部」原样发给后端。
  await goto('/cases', 2600)
  await evaluate(
    '(() => { var b = Array.from(document.querySelectorAll(".filter")).find(function (x) ' +
      '{ return x.innerText.trim() === "全部" }); if (b) b.click(); return !!b })()'
  )
  await sleep(2500)
  const allDirs = await caseDirections()
  check(
    allDirs.length === 18,
    '点「全部」看到的是全部 18 条，不是只有自己方向那几条（当前 ' + allDirs.length + ' 条）'
  )
  ctext = await bodyText()
  check(
    !ctext.includes('暂时还没有收录案例'),
    '点「全部」不会冒出"「全部」方向暂时还没有收录案例"这种读不通的话'
  )

  // ---- 「还没想好」：relaxed 分支里最特殊的一种 ----
  //
  // 问卷里选「还没想好」的人，他不是"这个方向没收录"，而是"还没定方向"。
  // 后端会返回通用案例 + relaxed = true。页面必须说人话
  // （「先看看大家的选择，再决定自己的路」），
  // 而不是因为"还没想好"被折成了"全部"，显示成
  // 「「全部」方向暂时还没有收录案例」——那句话读不通，像是页面坏了。
  //
  // 怎么造出这个状态：用接口重新提交一份 direction = 还没想好 的问卷
  // （一个用户只有一份问卷，重复提交会覆盖），本地记录也同步改掉。
  await evaluate(
    '(async () => {\n' +
      '  const token = localStorage.getItem("plan_token")\n' +
      '  const body = {\n' +
      '    direction: "还没想好", grade: "大三",\n' +
      '    status: { major_type: "理工类", school_level: "普通一本", score: "前30%", english: "已过六级", experience: ["实习"] },\n' +
      '    interest: ["具体怎么准备"], extra_note: ""\n' +
      '  }\n' +
      '  const r = await fetch("/api/answers", {\n' +
      '    method: "POST",\n' +
      '    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },\n' +
      '    body: JSON.stringify(body)\n' +
      '  })\n' +
      '  localStorage.setItem("plan_survey_' +
      username +
      '", JSON.stringify({ direction: "还没想好", grade: "大三" }))\n' +
      '  return r.status\n' +
      '})()'
  )
  await goto('/cases', 2600)
  ctext = await bodyText()
  cdirs = await caseDirections()
  check(cdirs.length > 0, '「还没想好」也有案例可看（' + cdirs.length + ' 条，没有白页）')
  check(
    ctext.includes('先看看大家的选择'),
    '看到的是"先看看大家的选择，再决定自己的路"这句引导'
  )
  check(
    !ctext.includes('「全部」方向暂时还没有收录案例'),
    '没有出现"「全部」方向暂时还没有收录案例"这种读不通的话'
  )

  // ---------- 10. 案例详情页（真后端） ----------
  // 交付标准是「展示时间线、关键节点、经验教训 —— 能看到完整步骤」，
  // 这里逐条对着验，重点是"步骤是不是从后端真的取全了"。
  section('【10】案例详情页（真后端）：完整步骤 + 关键节点 + 经验教训')
  await goto('/cases', 2600)
  const cardOk = await clickCaseCard('双非计算机大三考研上岸 211')
  await sleep(2400)
  check(cardOk, '点得到列表里的案例卡片')
  check((await currentHash()).indexOf('#/cases/1') === 0, '点进去到了详情页（地址 #/cases/1）')

  const dtext = await bodyText()
  check(dtext.includes('双非计算机大三考研上岸 211'), '详情页显示案例标题')
  check(dtext.includes('经验教训'), '有「经验教训」这一块')
  check(dtext.includes('数学开始太晚'), '从后端拿到了 experience 字段的原文')
  // 硬证据同上：接口没通时页面会多一行降级提示，不出现就说明数据来自后端
  check(!dtext.includes('案例接口还没上线'), '详情数据来自后端（没出现降级提示）')

  const dSteps = ((await evaluate('document.querySelectorAll(".step").length')) || 0)
  const dKeys = ((await evaluate('document.querySelectorAll(".step--key").length')) || 0)
  check(dSteps === 8, '后端给的 8 个步骤【全部】展示出来（当前 ' + dSteps + ' 步）')
  check(dKeys === 4, '4 个关键节点（is_key=1）被标出来（当前 ' + dKeys + ' 个）')
  check(
    dtext.includes('共 8 步') && dtext.includes('4 个关键节点'),
    '页面给出了"共几步、其中几个关键节点"的统计'
  )
  check(
    dtext.includes('打印准考证，提前踩点考场，参加初试'),
    '最后一步的内容也在页面上（步骤是完整的，不是只显示前几步）'
  )

  // 关键节点必须真的"看起来不一样"—— 实测颜色
  const keyC = await bgColor('.step--key .step__dot')
  const normalC = await bgColor('.step:not(.step--key) .step__dot')
  check(
    isOrangeColor(keyC) && keyC !== normalC,
    '关键节点是醒目的橙色标记，和普通节点实测不同（' + keyC + ' vs ' + normalC + '）'
  )

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
