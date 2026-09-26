import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      // 用 @ 代表 src 目录，import 时不用写一长串 ../../../
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    open: true,

    // ==========================================================
    //  host: true —— 让同一 WiFi 下的别人也能打开你的网站
    //
    //  不写这行：服务只监听 127.0.0.1，只有你自己电脑能开。
    //  写了这行：监听 0.0.0.0，组员用你的局域网 IP 就能访问。
    //  好处是不用每次敲 npm run dev -- --host 了。
    //
    //  【发布上线时这两行也是必需的】
    //  云端发布是把你的服务挂在一个反代域名后面，
    //  所以必须监听 0.0.0.0，并且放行那个外部域名。
    // ==========================================================
    host: true,

    // 允许非 localhost 的域名访问（云端发布必需，否则报
    // "Blocked request. This host is not allowed."）
    allowedHosts: true,

    // ==========================================================
    //  代理：解决跨域（CORS）问题的关键
    //  前端跑在 5173，后端跑在 5000，端口不同浏览器就会拦请求。
    //  配了 proxy 之后，前端只要发 /api/xxx，
    //  vite 就替你转给 Flask，浏览器以为没跨域。
    //
    //  ⚠️ 改完这个文件必须【重启】npm run dev 才生效！
    // ==========================================================
    proxy: {
      '/api': {
        // ↓ 如果同学 A 的后端端口不是 5000，只改这一行
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
