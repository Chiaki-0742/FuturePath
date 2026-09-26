/**
 * 环境开关。值来自根目录的 .env 文件。
 * 改完 .env 必须重启 npm run dev 才生效。
 */

// 是否走本地 Mock（不连后端）
//
// 默认开启：只有明确写 VITE_USE_MOCK=false 才走真实接口。
// 为什么反过来写？因为 .env 文件不会提交到 Git（防止泄露密码），
// 组员 clone 下来是没有 .env 的。若按"只有写了 true 才 Mock"的写法，
// 他们一打开就会去连还不存在的后端，四个页面全部报错。
// 这样写，没配置文件的人也能直接跑通全部页面。
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

// 接口前缀，默认 /api
export const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// 控制台打印一行，方便你确认当前到底连的是哪个
if (import.meta.env.DEV) {
  console.log(
    `[env] 当前模式：${USE_MOCK ? '本地 Mock（不连后端）' : '真实接口 ' + API_BASE}`
  )
}
