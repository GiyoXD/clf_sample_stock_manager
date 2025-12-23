import { createRouter, createWebHistory } from 'vue-router'
import StockInView from '../views/StockInView.vue'
import RecycleBinView from '../views/RecycleBinView.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            redirect: '/stock-in'
        },
        {
            path: '/stock-in',
            name: 'StockIn',
            component: StockInView
        },
        {
            path: '/stock-list',
            name: 'StockList',
            component: () => import('../views/StockListView.vue')
        },
        {
            path: '/draft',
            name: 'Draft',
            component: () => import('../views/DraftView.vue')
        },
        {
            path: '/history',
            name: 'History',
            component: () => import('../views/HistoryView.vue')
        },
        {
            path: '/database',
            name: 'Database',
            component: () => import('../views/DatabaseView.vue')
        },
        {
            path: '/trash',
            name: 'Trash',
            component: RecycleBinView
        }
    ]
})

export default router
