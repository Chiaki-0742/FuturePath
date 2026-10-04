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
    // ⚠️ 地址后面加的 ?r=时间戳 是有用的，不能删：
    //    如果两次都导航到同一个地址，浏览器不会真的重新加载，
    //    上一条用例在表单里填的内容就会残留下来，
    //    导致下一条用例"清空某项"这种断言假失败。
    const url = APP_URL + '/?r=' + Date.now() + '#' + hash
    await send('Page.navigate', { url })
    await sleep(wait || 2600)
  }
  const bodyText = async () =>
    ((await evaluate('document.body.innerText')) || '').replace(/\s+/g, ' ')
  const currentHash = () => evaluate('location.hash')

  // 填表。要兼容两种写法：
  //   原生 <input>             → 直接就是它自己
  //   Element Plus 的 el-input → id 可能落在外面那层 div 上，得往里再找一层
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
    // Element Plus 的校验是异步的，点完要等一下红字才会出来
    await sleep(700)
  }

  // 读取某个输入框当前的值（兼容原生 input 和 el-input 两层结构）
  const fieldValue = async (sel) =>
    (await evaluate(
      '(() => {\n' +
        '  var el = document.querySelector(' + JSON.stringify(sel) + ')\n' +
        '  if (!el) return null\n' +
        '  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el = el.querySelector("input, textarea, select")\n' +
        '  return el ? el.value : null\n' +
        '})()'
    )) || ''

  // 抓取"显示在输入框正下方的那行红字"
  const fieldErrors = async () =>
    (await evaluate(
      'Array.from(document.querySelectorAll(".el-form-item__error")).map(function (e) { return e.innerText.trim() })'
    )) || []

  // 抓第一行红字的实际颜色（用来验证"飘红字"这件事真的发生了，不是靠猜）
  const firstErrorColor = async () =>
    (await evaluate(
      '(() => { var e = document.querySelector(".el-form-item__error"); return e ? getComputedStyle(e).color : "" })()'
    )) || ''

  // 判断颜色是不是红色系：红通道明显大于绿、蓝通道
  const isRedColor = (c) => {
    const m = String(c).match(/[\d.]+/g)
    return !!m && Number(m[0]) > 150 && Number(m[0]) > Number(m[1]) + 60
  }

  // 把登录状态清掉再进下一个用例。
  // 必须做，否则路由守卫会把"已登录"的人从 /login、/register 直接送回首页，
  // 表单根本渲染不出来，用例会误报成 FAIL。
  const logout = async () => {
    await evaluate('localStorage.removeItem("plan_token")')
    await sleep(150)
  }

  // ---- 问卷页专用 ----
  //
  // 问卷三屏是"都在 DOM 里、只显示一屏"（v-show），
  // 所以找选项时必须先筛掉看不见的那两屏，
  // 否则会点到隐藏屏里的同名选项上（比如三屏里都有"都没有"就乱了）。
  // offsetParent 为 null 就是被 display:none 藏起来的元素。
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
    await sleep(160)
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
    await sleep(600)
    return found
  }

  // 读首页那张「你的方向」卡片上的大字。
  // ⚠️ 不能直接用 bodyText().includes("考研") 判断 —— 首页下面
  //    "大学四年，这样安排"那张卡片里本来就写着"保研、考研、就业、留学"，
  //    那样写的话不管有没有填问卷都会"通过"，等于没测。
  const directionOnHome = async () =>
    (await evaluate(
      '(() => { var el = document.querySelector(".direction"); return el ? el.innerText.trim() : "" })()'
    )) || ''

  // ---- 案例列表页专用 ----
  //
  // 读每张卡片右上角那个方向标签的文字。
  // 这是验证「筛选真的生效」的硬证据 —— 筛完只看"还剩几张"不够，
  // 必须逐张确认剩下那张的方向就是点的那一个。
  const caseDirections = async () =>
    (await evaluate(
      'Array.from(document.querySelectorAll(".chip--direction")).map(function (e) { return e.innerText.trim() })'
    )) || []

  // 当前高亮的筛选标签是哪个
  const activeFilter = async () =>
    (await evaluate(
      '(() => { var e = document.querySelector(".filter--on"); return e ? e.innerText.trim() : "" })()'
    )) || ''

  // 按文字点一个链接（首页的「看同方向的案例」是个 RouterLink，渲染成 <a> 不是 <button>）
  const clickLink = async (label) => {
    const found = await evaluate(
      '(() => {\n' +
        '  var as = Array.from(document.querySelectorAll("a")).filter(function (a) {\n' +
        '    return a.offsetParent !== null && a.innerText.replace(/\\s+/g, "") === ' +
        JSON.stringify(label) +
        ' })\n' +
        '  if (!as.length) return false\n' +
        '  as[0].click()\n' +
        '  return true\n' +
        '})()'
    )
    await sleep(400)
    return found
  }

  // ---- 案例详情页专用 ----
  //
  // 点一张案例卡片。卡片整个是个 <a class="case">，里面包着标题/画像/概述，
  // 所以不能像 clickLink 那样"按按钮文字精确匹配"，得用"文字包含"来找。
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
    await sleep(500)
    return found
  }

  // 点详情页左上角的「← 返回案例列表」
  const clickBack = async () => {
    const ok = await evaluate(
      '(() => { var a = document.querySelector("a.back"); if (!a) return false; a.click(); return true })()'
    )
    await sleep(1600)
    return ok
  }

  // 读某个元素的背景色。
  // ⚠️「关键节点很醒目」这件事必须【量】出来 —— 靠肉眼看截图判断颜色差别
  //    在这类断言上翻过车，一行 getComputedStyle 比眼睛可靠得多。
  const bgColor = async (sel) =>
    (await evaluate(
      '(() => { var e = document.querySelector(' +
        JSON.stringify(sel) +
        '); return e ? getComputedStyle(e).backgroundColor : "" })()'
    )) || ''

  // 判断颜色是不是橙色系（关键节点用的那个色）：
  // rgb(217, 136, 23) 的特征是 红 > 绿 > 蓝，且三者拉得开。
  const isOrangeColor = (c) => {
    const m = String(c).match(/[\d.]+/g)
    if (!m) return false
    const [r, g, b] = m.map(Number)
    return r > 180 && r > g && g > b + 40
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
  section('【1】注册：填表 -> 提交 -> 自动进入问卷')
  await goto('/register')
  await fill([
    ['#username', 'e2e' + seed],
    ['#password', 'abc123'],
    ['#confirm', 'abc123'],
    ['#name', '自检同学'],
    ['#major', '计算机科学与技术'],
    // 年级不填：下拉框已经有默认值"大一"。
    // 而且 Element Plus 的 el-select 不是原生 <select>，直接赋值它是收不到的。
  ])
  await submit()
  await sleep(2600)
  let text = await bodyText()
  let hash = await currentHash()
  console.log('   跳转后:', hash)
  // 2026-10-02 起：新用户注册成功后不再直接进首页，而是被带去填问卷（新手引导）
  check(hash === '#/survey', '注册成功后自动进入问卷页')
  check(text.includes('第 1 步 / 共 3 步'), '问卷页显示当前在第几步（进度）')
  check(text.includes('未来方向'), '问卷第一屏是「未来方向」')

  // ---------- 1-b. 问卷：没选就点"下一步"，必须被拦下 ----------
  section('【1-b】问卷：题目没选就点「下一步」')
  await clickButton('下一步')
  text = await bodyText()
  hash = await currentHash()
  const surveyErrs = await fieldErrors()
  console.log('   当前:', hash, ' 红字:', JSON.stringify(surveyErrs))
  check(hash === '#/survey', '没有被放过去，还停在问卷页')
  check(text.includes('第 1 步 / 共 3 步'), '仍然显示第 1 步')
  check(surveyErrs.length > 0, '没答的题目下方出现提示（说明校验真的生效了）')

  // ---------- 1-c. 问卷：三屏逐屏填完 -> 提交 ----------
  section('【1-c】问卷：三屏填完 -> 提交 -> 首页显示方向')
  check(await clickOption('考研'), '第 1 屏选中「考研」')
  await clickButton('下一步')
  text = await bodyText()
  check(text.includes('第 2 步 / 共 3 步'), '进入第 2 屏（当前现状）')

  // B 组 6 题：年级 / 专业 / 学校 / 成绩 / 英语 / 经历（多选）
  const statusPicks = ['大三', '理工类', '普通一本', '前30%', '已过六级', '实习']
  let pickedAll = true
  for (const opt of statusPicks) {
    const ok = await clickOption(opt)
    if (!ok) {
      pickedAll = false
      console.log('   ⚠️ 页面上没找到这个选项:', opt)
    }
  }
  check(pickedAll, '第 2 屏 6 道题都选上了')

  await clickButton('下一步')
  text = await bodyText()
  check(text.includes('第 3 步 / 共 3 步'), '进入第 3 屏（想了解什么）')

  check(await clickOption('具体怎么准备'), '第 3 屏选中一个想了解的问题')
  await clickButton('提交问卷')
  await sleep(2600)
  hash = await currentHash()
  text = await bodyText()
  console.log('   提交后跳转到:', hash)
  check(hash === '#/', '提交后进入首页')
  check(text.includes('你的方向'), '首页出现「你的方向」卡片')
  const dir = await directionOnHome()
  console.log('   首页上显示的方向:', JSON.stringify(dir))
  check(dir === '考研', '首页显示的方向就是问卷里选的那个')

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
  ])
  await submit()
  await sleep(900)
  text = await bodyText()

  // 这两项是任务②（表单校验升级）的验收点
  const errs = await fieldErrors()
  console.log('   输入框下方的红字:', JSON.stringify(errs))
  check(errs.includes('两次输入的密码不一致'), '校验提示显示在输入框下方（不是弹窗）')
  const errColor = await firstErrorColor()
  check(isRedColor(errColor), '提示文字是红色的（实测 ' + errColor + '）')

  check(text.includes('两次输入的密码不一致'), '前端校验拦住了不一致的密码')

  // ---------- 2-b. 必填校验（rules 里的 required） ----------
  section('【2-b】注册：用户名留空')
  await logout()
  await goto('/register')
  await fill([
    ['#password', 'abc123'],
    ['#confirm', 'abc123'],
    ['#name', '自检同学'],
    ['#major', '计算机科学与技术'],
  ])
  await submit()
  await sleep(700)
  const errsRequired = await fieldErrors()
  const usernameNow = await fieldValue('#username')
  console.log('   提交时用户名输入框的值:', JSON.stringify(usernameNow))
  console.log('   输入框下方的红字:', JSON.stringify(errsRequired))
  check(usernameNow === '', '前置条件：用户名输入框确实是空的')
  check(errsRequired.includes('请输入用户名'), '必填项留空时，提示出现在对应输入框下方')

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
  ])
  await submit()
  await sleep(2200)
  text = await bodyText()
  check(text.includes('用户名已存在'), '后端返回的错误正确显示到页面上')

  // ---------- 4. 登录 ----------
  section('【4】登录：test / 123456（已填过问卷的老用户）')
  await logout()
  // 给 test 预置一份问卷记录，模拟"早就填过问卷的人"。
  // 不预置的话，登录后会先被新手引导带去问卷页，这条用例会误报成失败。
  await evaluate(
    'localStorage.setItem("plan_survey_test", JSON.stringify({' +
      'direction:"考研",grade:"大一",status:{major_type:"理工类"},' +
      'interest:["具体怎么准备"],extra_note:"",created_at:"2026-10-01T00:00:00.000Z"}))'
  )
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
  check(hash === '#/', '填过问卷的老用户直接进首页（不再被拦去问卷）')
  check(text.includes('你好，test'), '首页显示当前用户名')
  check(text.includes('账号信息'), '用户资料通过接口加载成功')
  check(text.includes('测试同学'), '资料字段按约定渲染（姓名）')
  check((await directionOnHome()) === '考研', '首页从本地问卷记录里显示出方向')

  // ---------- 4-b. 案例列表页：默认进来能出结果 ----------
  //
  // test 这个账号预置的问卷方向是「考研」，所以直接打开 /cases（地址里不带参数）
  // 应该自动筛到考研 —— "和我情况相近的人怎么走的"，这比默认全量更贴题目。
  section('【4-b】案例列表页：默认打开就有内容')
  await goto('/cases')
  await sleep(2200)
  text = await bodyText()
  check(text.includes('真实案例'), '页面正常打开')
  check((await activeFilter()) === '考研', '按问卷里的方向自动筛好了（默认选中「考研」）')

  let dirs = await caseDirections()
  check(dirs.length === 3, '案例卡片渲染出来了（「考研」当前 ' + dirs.length + ' 张）')
  check(
    dirs.every((d) => d === '考研'),
    '卡片上的方向标签都是「考研」'
  )
  check(text.includes('双非计算机大三考研上岸 211'), '卡片显示标题')
  check(text.includes('普通一本') && text.includes('理工类'), '卡片显示人物画像')
  check(text.includes('大三上定校，暑假强化刷题'), '卡片显示概述')

  // ---------- 4-c. 按方向筛选 ----------
  section('【4-c】案例列表页：按方向筛选')
  const clickedStudy = await clickButton('留学')
  await sleep(1400)
  check(clickedStudy, '点得到「留学」这个筛选标签')
  check((await activeFilter()) === '留学', '「留学」标签变成选中状态')

  dirs = await caseDirections()
  check(dirs.length === 2, '筛完只剩 2 条（当前 ' + dirs.length + ' 条）')
  check(
    dirs.every((d) => d === '留学'),
    '筛完之后剩下的案例【全部】都是「留学」方向'
  )

  // 再换一个方向。只测一次的话，"点完就卡住不再重新筛"这种 bug 测不出来
  await clickButton('考公')
  await sleep(1400)
  dirs = await caseDirections()
  check(
    dirs.length === 1 && dirs[0] === '考公',
    '换成「考公」后只剩那 1 条考公案例（当前 ' + dirs.length + ' 条）'
  )

  // 点回全部，确认能恢复
  await clickButton('全部')
  await sleep(1400)
  dirs = await caseDirections()
  check(dirs.length === 10, '点回「全部」后 10 条案例都回来了（当前 ' + dirs.length + ' 条）')

  // ---------- 4-d. 首页的案例入口 ----------
  section('【4-d】首页 -> 案例列表 的入口')
  await goto('/')
  await sleep(2000)
  const entryOk = await clickLink('看同方向的案例')
  await sleep(1800)
  check(entryOk, '首页方向卡片上有「看同方向的案例」入口')
  check((await currentHash()).indexOf('#/cases') === 0, '点进去到了案例列表页')
  check((await activeFilter()) === '考研', '带着问卷里的方向进去，列表已经筛好了')

  // ---------- 4-e. 案例表里没有的方向，不能筛出空白页 ----------
  //
  // "创业"是问卷第 1 题里能选的选项，但案例表里一条都没有
  // （已知的数据不一致：问卷有创业、案例有保研，两边对不上）。
  // 这种时候页面绝对不能空着 —— 空页面看起来就像页面坏了。
  // 正确做法：保留用户选的方向、说明情况、给出其他方向的案例。
  section('【4-e】案例列表页：案例表里没有的方向（创业）')
  await goto('/cases?direction=' + encodeURIComponent('创业'), 2600)
  text = await bodyText()
  check((await activeFilter()) === '创业', '用户选的方向被保留并选中（没被无声丢掉）')
  check(text.includes('暂时还没有收录案例'), '页面上说明了"这个方向还没有收录案例"')
  dirs = await caseDirections()
  check(
    dirs.length === 10,
    '没有出现空白页，展示的是其他方向的 ' + dirs.length + ' 条案例'
  )
  // 统计文案不能说错：这 10 条是"其他方向"的，不能写成"共 10 条「创业」的案例"，
  // 那样用户会以为案例表里真有 10 条创业案例
  check(
    text.includes('共 10 条其他方向的案例'),
    '统计文案说清了这是"其他方向"的案例，没冒名顶替'
  )

  // ---------- 4-f. relaxed 判断（纯逻辑，不依赖后端） ----------
  // 后端同学 review 时指出：接口层把 relaxed 硬编码成 false，会让"其他方向的案例"
  // 被说成"「创业」的案例"。这条链路在页面上暂时触发不到（接口还没上线，
  // mock 模式也不走那段代码），所以直接把判断函数捞出来，逐个场景验。
  section('【4-f】relaxed 判断：别方向的案例不能被说成本方向的')
  let isRelaxed = null
  try {
    const casesMod = await import(
      require('node:url')
        .pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'cases.js'))
        .href
    )
    isRelaxed = casesMod.isRelaxed
  } catch (e) {
    isRelaxed = null
  }
  check(typeof isRelaxed === 'function', '能加载到案例判断逻辑（utils/cases.js 导出正常）')
  if (typeof isRelaxed === 'function') {
    const mixed = [
      { id: 1, direction: '考研' },
      { id: 2, direction: '就业' },
    ]
    const allKy = [
      { id: 3, direction: '考研' },
      { id: 4, direction: '考研' },
    ]
    check(isRelaxed(mixed, '创业', undefined) === true, '选了「创业」但返回的是别方向 -> 判为放宽')
    check(isRelaxed(allKy, '考研', undefined) === false, '返回的确实全是所选方向 -> 不算放宽')
    check(isRelaxed(mixed, '', undefined) === false, '没筛方向（全部）-> 不存在放宽')
    check(isRelaxed([], '创业', undefined) === false, '接口返回空列表 -> 不算放宽（另走兜底）')
    check(isRelaxed(mixed, '创业', false) === false, '后端明确说没放宽 -> 以后端为准')
    check(isRelaxed(allKy, '考研', true) === true, '后端明确说放宽了 -> 以后端为准')
    check(isRelaxed(mixed, '创业', null) === true, '后端没给布尔值（null）-> 前端自己也算得对')
  }

  // ---------- 4-g. 案例详情页 ----------
  // 交付标准是「展示时间线、关键节点、经验教训 —— 能看到完整步骤」，
  // 所以这一组用例逐条对着这句话验：步骤全不全、关键节点认不认得出来、
  // 经验教训在不在。
  section('【4-g】案例详情页：时间线 / 关键节点 / 经验教训')
  await goto('/cases', 2600)
  const cardClicked = await clickCaseCard('双非计算机大三考研上岸 211')
  await sleep(2000)
  check(cardClicked, '点得到列表里的案例卡片')
  check((await currentHash()).indexOf('#/cases/1') === 0, '点进去到了详情页（地址 #/cases/1）')

  text = await bodyText()
  check(text.includes('双非计算机大三考研上岸 211'), '详情页显示案例标题')
  check(text.includes('经验教训'), '有「经验教训」这一块')
  check(text.includes('数学开始太晚'), '显示了数据库里那句经验教训原文')
  check(text.includes('已上岸某 211 计算机专硕'), '显示了最终结果')

  // 时间线：8 步，其中 4 个是关键节点（与 init.sql 案例 1 的数据一致）
  const stepCount = ((await evaluate('document.querySelectorAll(".step").length')) || 0)
  const keyCount = ((await evaluate('document.querySelectorAll(".step--key").length')) || 0)
  check(stepCount === 8, '时间线【完整】展示了 8 个步骤（当前 ' + stepCount + ' 步）')
  check(keyCount === 4, '其中 4 个关键节点被单独标了出来（当前 ' + keyCount + ' 个）')
  check(
    text.includes('共 8 步') && text.includes('4 个关键节点'),
    '页面上给出了"共几步、其中几个关键节点"的统计'
  )

  // 完整步骤：第 1 步和最后一步的内容都要在，只显示前几步不算"完整"
  check(text.includes('确定目标院校和专业，收集历年分数线'), '第 1 步的内容在页面上')
  check(text.includes('打印准考证，提前踩点考场，参加初试'), '第 8 步（最后一步）的内容也在页面上')
  check(text.includes('关键节点'), '关键节点上有「关键节点」角标')

  // 关键节点要真的"看起来不一样"—— 实测颜色，不靠眼睛
  const keyDot = await bgColor('.step--key .step__dot')
  const normalDot = await bgColor('.step:not(.step--key) .step__dot')
  check(
    keyDot !== '' && normalDot !== '' && keyDot !== normalDot,
    '关键节点的圆点颜色和普通节点【实测】不一样（' + keyDot + ' vs ' + normalDot + '）'
  )
  check(isOrangeColor(keyDot), '关键节点用的是醒目的橙色标记（' + keyDot + '）')

  // 返回列表要能回得去，并且带回原来的筛选方向
  const backOk = await clickBack()
  await sleep(1800)
  check(backOk && (await currentHash()).indexOf('#/cases') === 0, '能返回案例列表')
  check((await activeFilter()) === '考研', '返回后仍保持原来的方向筛选')

  // ---------- 4-h. 详情页：不存在的案例 ----------
  // 地址里的 id 写错了（或者那条案例被删了）也不能白屏 ——
  // "页面一片空白"和"页面告诉你没有这条案例"是完全不同的体验。
  section('【4-h】案例详情页：不存在的案例')
  await goto('/cases/9999', 2400)
  text = await bodyText()
  check(text.includes('没有找到这条案例'), 'id 不存在时给出明确提示（没有白屏）')
  check(text.includes('看看全部案例'), '并且给了一个回列表的出口')

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
