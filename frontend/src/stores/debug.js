import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDebugStore = defineStore('debug', () => {
    const logs = ref([])
    const isVisible = ref(false)

    const addLog = (message, type = 'info', details = null) => {
        const timestamp = new Date().toLocaleTimeString()
        logs.value.unshift({
            id: Date.now() + Math.random(),
            timestamp,
            message,
            type,
            details
        })

        // Auto-show on error
        if (type === 'error') {
            isVisible.value = true
        }

        // Keep limit to prevent memory issues
        if (logs.value.length > 200) {
            logs.value.pop()
        }
    }

    const clearLogs = () => {
        logs.value = []
    }

    const toggleVisibility = () => {
        isVisible.value = !isVisible.value
    }

    return {
        logs,
        isVisible,
        addLog,
        clearLogs,
        toggleVisibility
    }
})
