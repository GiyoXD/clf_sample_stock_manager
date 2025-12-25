<script setup>
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { computed } from 'vue'
import DebugConsole from './components/DebugConsole.vue'

const route = useRoute()
const activeTab = computed(() => route.matched[0]?.path || '')

const navClasses = (path) => {
    const isActive = route.path.startsWith(path)
    return isActive 
        ? 'bg-teal-500 text-white shadow px-4 py-2 rounded-md text-sm font-medium transition-all'
        : 'text-slate-300 hover:text-white hover:bg-slate-600 px-4 py-2 rounded-md text-sm font-medium transition-all'
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gray-100">
    <!-- Header -->
    <header class="bg-slate-800 text-white shadow-lg sticky top-0 z-50">
        <div class="w-full px-6 py-3 flex justify-between items-center">
            <div class="flex items-center space-x-3">
                <i class="fa-solid fa-boxes-stacked text-2xl text-teal-400"></i>
                <h1 class="text-xl font-bold tracking-wide">Sample Manager <span class="text-xs font-normal text-slate-400 ml-2">v2.0 Full Stack</span></h1>
            </div>
            <!-- Navigation -->
            <nav class="flex space-x-1 bg-slate-700 p-1 rounded-lg">
                <RouterLink to="/stock-in" :class="navClasses('/stock-in')">
                    <i class="fa-solid fa-dolly mr-2"></i>Stock In
                </RouterLink>
                <RouterLink to="/stock-list" :class="navClasses('/stock-list')">
                    <i class="fa-solid fa-list mr-2"></i>Stock List
                </RouterLink>
                <RouterLink to="/clf" :class="navClasses('/clf')">
                    <i class="fa-solid fa-clipboard-list mr-2"></i>CLF
                </RouterLink>
                <RouterLink to="/draft" :class="navClasses('/draft')">
                    <i class="fa-solid fa-paper-plane mr-2"></i>Express Draft
                </RouterLink>
                <RouterLink to="/history" :class="navClasses('/history')">
                    <i class="fa-solid fa-history mr-2"></i>History
                </RouterLink>
                <RouterLink to="/database" :class="navClasses('/database')">
                    <i class="fa-solid fa-database mr-2"></i>Database
                </RouterLink>
                <RouterLink to="/trash" :class="navClasses('/trash')">
                    <i class="fa-solid fa-trash-arrow-up mr-2"></i>Recycle Bin
                </RouterLink>
            </nav>
        </div>
    </header>

    <!-- Main Content -->
    <main class="flex-grow w-full px-6 py-6">
        <RouterView v-slot="{ Component }">
            <transition name="fade" mode="out-in">
                <component :is="Component" />
            </transition>
        </RouterView>
    </main>

    <DebugConsole />
  </div>
</template>

<style>
/* Global Styles from sample_manager.html can be moved to base.css, but okay here for now or imported */
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
