import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import { useDebugStore } from './stores/debug'

const app = createApp(App)
const pinia = createPinia()

// Configure Axios for Tauri Sidecar
import axios from 'axios'
axios.defaults.baseURL = 'http://127.0.0.1:3000';

app.use(pinia)
app.use(router)

// Global Error Handling
const debugStore = useDebugStore()

app.config.errorHandler = (err, instance, info) => {
    console.error("Global Vue Error:", err)
    debugStore.addLog(`Vue Error: ${err.message}`, 'error', {
        stack: err.stack,
        info,
        component: instance?.$options?.name || 'Unknown'
    })
}

window.addEventListener('unhandledrejection', (event) => {
    console.error("Unhandled Rejection:", event.reason)
    debugStore.addLog(`Unhandled Promise: ${event.reason}`, 'error', event.reason)
})

// Router Debugging
router.beforeEach((to, from, next) => {
    debugStore.addLog(`Navigating to: ${to.path}`, 'info')
    next()
})

router.afterEach((to, from) => {
    debugStore.addLog(`Navigation Complete: ${to.path}`, 'success')
})

app.mount('#app')

