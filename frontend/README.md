# frontend —— 前端工程

Vue 3 + Vite 的前端骨架，包含**注册、登录、登录后首页、个人中心**四个页面。

**现在就能跑起来，不用等后端。** 默认使用本地 Mock 数据，四个页面全部可用。

---

## 一、三条命令跑起来

```bash
cd frontend
npm install
npm run dev
```

浏览器会自动打开 `http://localhost:5173`。

如果 npm install 很慢，检查 `frontend/.npmrc` 里的镜像源是否生效（已配置为国内 npmmirror）。

---

## 二、打开后能看到什么

| 页面 | 地址 | 说明 |
|---|---|---|
| 首页 | `http://localhost:5173/#/` | 需要登录，没登录会自动跳到登录页 |
| 登录 | `http://localhost:5173/#/login` | Mock 模式下有测试账号提示 |
| 注册 | `http://localhost:5173/#/register` | 注册一个自己的账号试试 |
| 个人中心 | `http://localhost:5173/#/profile` | 可修改邮箱、手机、年级、专业 |

**Mock 模式自带的测试账号：**

```
用户名：test
密码：123456
```

也可以自己注册一个。数据存在浏览器本地，刷新不丢。

---

## 三、目录结构

```
frontend/
├─ .env                     ← 开关文件：mock 还是真接口
├─ .npmrc                   ← npm 国内镜像源
├─ vite.config.js           ← 端口、@ 别名、跨域代理
├─ index.html
├─ tools/
│  └─ check-e2e.cjs         ← 一键自检脚本（见第七节）
└─ src/
   ├─ main.js               ← 入口：挂载 router + pinia
   ├─ App.vue               ← 顶栏 + 页脚 + <RouterView>
   ├─ style.css             ← 全局样式（卡片、表单、按钮、提示条）
   ├─ api/
   │   ├─ config.js         ← 读取 .env 的开关
   │   ├─ request.js        ← axios 实例 + 两个拦截器
   │   ├─ mock.js           ← 本地假数据（后端没好时用）
   │   └─ user.js           ← 五个用户接口，页面只 import 这里
   ├─ stores/
   │   └─ user.js           ← 登录状态、用户资料（Pinia）
   ├─ router/
   │   └─ index.js          ← 路由表 + 登录守卫
   ├─ utils/
   │   └─ token.js          ← token 的读写
   └─ views/
       ├─ Home.vue          ← 登录后首页
       ├─ Login.vue         ← 登录页
       ├─ Register.vue      ← 注册页
       ├─ Profile.vue       ← 个人中心
       └─ NotFound.vue      ← 404
```

**关键是 `src/api/` 这一层**：页面不直接碰 axios，只调 `api/user.js` 里的函数。
以后后端改路径，只改这一个文件，四个页面都不用动。

---

## 四、怎么切到真实后端

打开 `frontend/.env`，把 `VITE_USE_MOCK` 改成 `false`：

```env
VITE_USE_MOCK=false
```

**然后必须重启 `npm run dev`**（vite 的环境变量不热更新，这是最容易踩的坑）。

再检查 `vite.config.js` 里的后端地址对不对：

```js
proxy: {
  '/api': {
    target: 'http://localhost:5000',  // ← 同学 A 的 Flask 端口
    changeOrigin: true,
  },
},
```

改完也要重启。

---

## 五、页面需要的接口

前四个是分工里定好的，后三个是四个页面跑起来后**额外需要**的，要跟同学 A 确认：

| 页面 | 方法 + 路径 | 请求参数 | 期望返回 |
|---|---|---|---|
| 注册页 | `POST /api/register` | `{username, password}` | 成功；失败时给 `msg`，如"用户名已存在" |
| 登录页 | `POST /api/login` | `{username, password}` | `{token, user:{id, username, email}}` |
| 首页 | `GET /api/user/info` | 无（靠 token 认人） | 当前用户资料 |
| 个人中心 | `GET /api/user/info` | 无 | 同上 |
| 个人中心 | `PUT /api/user/info` | `{email, phone, grade, major}` | 更新后的资料 |
| 顶栏「退出登录」 | `POST /api/logout` | 无 | 成功（可选） |

### 统一返回格式（务必和后端约定成这个）

```json
{ "code": 200, "msg": "成功", "data": { } }
```

- `code` = 200 或 0 → 成功
- `code` = 其它 → 失败，`msg` 是给人看的提示
- `data` 才是真正的数据

**为什么必须统一**：格式统一了，前端只在 `api/request.js` 的拦截器里处理一次；
不统一，四个页面就得各写一套判断。

### 登录身份怎么带

前端已经在 `api/request.js` 里自动加好了请求头：

```
Authorization: Bearer <token>
```

所以**后端建议用 JWT**。如果 A 用的是 Flask session（默认），跨域带 cookie 还要额外配
`SameSite` 和 `credentials`，前端会多花不少时间调。

---

## 六、常见问题

**1. 页面上报"网络异常，请确认后端已经启动"**
`.env` 里 `VITE_USE_MOCK` 设成 `false` 了，但后端没起。
先改回 `true`，或者把 Flask 跑起来。

**2. 控制台报 `CORS policy`**
跨域。三种可能：
- vite 的 proxy 没配（本项目已配好，检查 target 端口）
- 改完 `vite.config.js` 没重启 dev server
- 后端缺 `flask-cors`（这个是同学 A 那边要装）

**3. 改完 `.env` 或 `vite.config.js` 没反应**
这两个文件都**不会热更新**，必须 `Ctrl + C` 停掉再 `npm run dev`。

**4. 想清空注册过的测试账号**
F12 → Application → Local Storage → 删掉 `plan_mock_users` 和 `plan_token`。

**5. 登录后刷新页面，怎么就退出了**
不该出现。token 存在 localStorage 里，`stores/user.js` 会用它重新拉资料。
如果真退出，检查浏览器是不是禁用了本地存储。

---

## 七、自检：一行命令验证四个页面真的能跑

页面能打开，不代表功能能用。所以项目里带了一个自检脚本。

```bash
# 终端 1：跑开发服务器，保持别关
npm run dev

# 终端 2：跑自检
node tools/check-e2e.cjs
```

它会用无头浏览器**真的去点按钮**，自动走完：

1. 注册一个新账号 → 是否跳到登录页
2. 两次密码填不一致 → 前端校验有没有拦住
3. 注册一个已存在的用户名 → 后端的错误有没有显示到页面上
4. 用 test / 123456 登录 → 是否进首页、资料是否加载出来
5. 打开个人中心 → 表单是否渲染完整
6. 清掉 token 再访问个人中心 → 登录守卫有没有拦住

全过会打印 `全部通过`，有失败会标 `FAIL` 并说明是哪一项。

**两个终端缺一不可。** 忘了开开发服务器的话，脚本会直接告诉你「连不上开发服务器」
并退出（退出码 2），而不会刷出一堆看不懂的 FAIL——那种输出会让人误以为代码写坏了。

| 结果 | 退出码 | 含义 |
|---|---|---|
| `全部通过` | 0 | 代码正常 |
| 有 `FAIL` | 1 | 代码有问题，看标 FAIL 的行 |
| `【环境检查】` 就退出 | 2 | 环境没准备好（多半是没开 `npm run dev`），代码本身没被验证过 |

**改了代码之后跑一下**，比手点六个页面靠谱得多。
（这也是为什么我们能发现"登录成功但资料加载失败"这种肉眼看不出的问题。）

---

## 八、和别人协作

- **同学 A（后端）**：不用碰这个目录。只要保证接口返回上面那个统一格式。
- **同学 C（队长/仓库）**：`node_modules/` 和 `dist/` 已被 `.gitignore` 排除，
  不会污染仓库。克隆下来后各自跑 `npm install` 即可。
- **提交前**：跑一次 `npm run build`，能过说明没有语法错误。

> 顺手说一句：四个页面每个都做到了「表单 → 请求 → 展示结果」的完整链路，
> 都带了 loading 状态、错误提示和 `try/catch`。这就是分工里说的产出标准。
