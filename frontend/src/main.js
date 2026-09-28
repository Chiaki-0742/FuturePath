import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Element Plus 组件库：全局注册一次，四个页面里就能直接用 <el-input>、<el-button> 这类标签
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn' // 组件内的中文文案（如"请选择"）
// ⚠️ 这两行顺序不能反：先引组件库样式，再引我们自己的。
//    反过来的话，style.css 里的主题定制会被组件库的默认蓝色盖回去。
import 'element-plus/dist/index.css'
import './style.css'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

app.mount('#app')
