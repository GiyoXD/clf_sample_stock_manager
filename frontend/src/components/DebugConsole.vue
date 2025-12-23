<script setup>
import { useDebugStore } from '../stores/debug'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

const debugStore = useDebugStore()
const { logs, isVisible } = storeToRefs(debugStore)
const expandedLog = ref(null)

const toggleExpand = (id) => {
    expandedLog.value = expandedLog.value === id ? null : id
}

const getTypeColor = (type) => {
    switch(type) {
        case 'error': return 'text-red-500'
        case 'warn': return 'text-yellow-500'
        case 'success': return 'text-green-500'
        default: return 'text-blue-400'
    }
}
</script>

<template>
    <div class="fixed bottom-4 right-4 z-[9999] flex flex-col items-end pointer-events-none">
        <!-- Toggle Button -->
        <button 
            @click="debugStore.toggleVisibility()" 
            class="pointer-events-auto bg-slate-800 text-white p-3 rounded-full shadow-lg hover:bg-slate-700 transition-all border border-slate-600"
            :class="{ 'mb-4': isVisible }"
            title="Toggle Debug Console"
        >
            <i class="fa-solid fa-bug" :class="{ 'text-red-500': logs.some(l => l.type === 'error') }"></i>
        </button>

        <!-- Console Panel -->
        <div v-if="isVisible" class="pointer-events-auto w-[600px] h-[400px] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden text-xs font-mono">
            <!-- Header -->
            <div class="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                <span class="font-bold text-slate-300">Debug Console ({{ logs.length }})</span>
                <div class="space-x-2">
                    <button @click="debugStore.clearLogs()" class="px-2 py-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
                        <i class="fa-solid fa-trash-can mr-1"></i>Clear
                    </button>
                    <button @click="debugStore.toggleVisibility()" class="px-2 py-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            </div>

            <!-- Logs List -->
            <div class="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-950">
                <div v-for="log in logs" :key="log.id" class="border-b border-slate-800 pb-1 last:border-0 hover:bg-slate-900">
                    <div @click="toggleExpand(log.id)" class="flex cursor-pointer py-1 px-1">
                        <span class="text-slate-500 mr-2 shrink-0">[{{ log.timestamp }}]</span>
                        <span :class="['font-bold mr-2 uppercase text-[10px] w-12 shrink-0', getTypeColor(log.type)]">{{ log.type }}</span>
                        <span class="text-slate-300 truncate">{{ log.message }}</span>
                        <i v-if="log.details" class="ml-auto fa-solid fa-chevron-down text-slate-600 text-[10px] pt-1"></i>
                    </div>
                    
                    <!-- Expanded Details -->
                    <div v-if="expandedLog === log.id && log.details" class="bg-slate-900 p-2 mt-1 rounded border border-slate-800 text-slate-400 whitespace-pre-wrap overflow-x-auto">
                        {{ JSON.stringify(log.details, null, 2) }}
                    </div>
                </div>
                
                <div v-if="logs.length === 0" class="text-center text-slate-600 mt-10 italic">
                    No logs yet...
                </div>
            </div>
        </div>
    </div>
</template>
