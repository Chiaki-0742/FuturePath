import { createRouter, createWebHashHistory } from 'vue-router'
import { getToken } from '@/utils/token'
import { useUserStore } from '@/stores/user'
import { hasSurveyRecord, localUsername } from '@/utils/survey'

/**
 * 路由表 —— 四个页面在这里登记。
 *
 * 用 hash 模式（地址栏里带 #），好处是不用配服务器就能部署，
 * 刷新页面也不会 404。学生项目强烈推荐这个模式。
 *
 * meta.requiresAuth = true 表示"没登录不许进"。
 */

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/Home.vue'),
    meta: { requiresAuth: true, title: '首页' },
  },
  {
    // 别名：任务书里写的首页地址是 /home，这里让它也能进首页。
    // 注意 hash 模式下完整地址要写成 http://localhost:5173/#/home
    path: '/home',
    redirect: '/',
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/Register.vue'),
    meta: { title: '注册' },
  },
  {
    path: '/survey',
    name: 'survey',
    component: () => import('@/views/Survey.vue'),
    meta: { requiresAuth: true, title: '规划问卷' },
  },
  {
    path: '/cases',
    name: 'cases',
    component: () => import('@/views/Cases.vue'),
    meta: { requiresAuth: true, title: '真实案例' },
  },
  {
    // 案例详情。注意这条要写在 '/cases' 后面 ——
    // vue-router 是按顺序匹配的，先写这条的话 '/cases' 会被它当成 id="xxx" 吃掉。
    path: '/cases/:id',
    name: 'case-detail',
    component: () => import('@/views/CaseDetail.vue'),
    meta: { requiresAuth: true, title: '案例详情' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/Profile.vue'),
    meta: { requiresAuth: true, title: '个人中心' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '页面不存在' },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

// ---------------------------------------------------------------
// 登录守卫：没登录的人访问受保护页面，自动送回登录页
// ---------------------------------------------------------------
router.beforeEach((to) => {
  const isLoggedIn = !!getToken()

  // 状态同步：万一 token 在别处被清掉了（比如另一个标签页点了"退出登录"），
  // 这里的内存状态也要跟上，不然顶栏会一直显示"已登录"，看着很怪。
  const userStore = useUserStore()
  if (!isLoggedIn && userStore.token) {
    userStore.token = ''
    userStore.userInfo = null
  }

  if (to.meta.requiresAuth && !isLoggedIn) {
    // 记住原本想去哪，登录成功后直接送回去
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // ---------------------------------------------------------------
  // 新手引导：还没填过问卷的人，先引导去问卷页
  //
  // 这里能"马上"判断，是有前提的：mock 模式下 token 是自己拼的
  // （mock-token.用户名.时间戳），能反解出用户名，所以能立刻查本地记录。
  // 真后端返回的是一串随机字符，反解不出用户名，这里只能先放行 ——
  // 等首页用 GET /api/me 拿到用户名后再兜底一次（见 Home.vue）。
  // 两条路都得有，否则"新用户被自动带去问卷"这件事在真后端下会失效。
  //
  // 登录页和注册页要排除掉：这两个页面本来就是"还没决定去哪"的状态，
  // 在这上面再加一层跳转，会绕一圈才到地方。
  // ---------------------------------------------------------------
  if (isLoggedIn && to.name !== 'survey' && to.name !== 'login' && to.name !== 'register') {
    const username = userStore.userInfo?.username || localUsername()
    if (username && !hasSurveyRecord(username)) {
      return { name: 'survey', query: { redirect: to.fullPath } }
    }
  }

  // 已经登录了还想去登录/注册页，直接送去首页
  if (isLoggedIn && (to.name === 'login' || to.name === 'register')) {
    return { name: 'home' }
  }

  return true
})

// 顺手改浏览器标签页标题
router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} · 大学生未来规划`
    : '大学生未来规划'
})

export default router
