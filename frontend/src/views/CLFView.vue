<script setup>
import { ref, computed, onMounted } from 'vue'
import { useInventoryStore } from '../stores/inventory'
import { useRoute } from 'vue-router'

const store = useInventoryStore()
const route = useRoute()

const poFilterInput = ref('')

onMounted(() => {
    store.fetchAll()
    
    // Check for incoming POs from Stock List
    if (route.query.pos) {
        try {
            const pos = JSON.parse(route.query.pos)
            if (Array.isArray(pos)) {
                poFilterInput.value = pos.join('\n')
            }
        } catch (e) {
            console.error('Failed to parse POs', e)
        }
    }
})

// Helper to format date
const formatDate = (dateString) => {
    if (!dateString) return ''
    try {
        return new Date(dateString).toISOString().split('T')[0]
    } catch (e) {
        return dateString
    }
}

const filteredStock = computed(() => {
    let result = store.currentInventory
    const rawInput = poFilterInput.value.trim()

    if (!rawInput) {
        // Performance optimization: Don't show all 2000+ items by default.
        // Only show results when user actively filters.
        return []
    }

    const queries = rawInput.split('\n').map(q => q.trim().toLowerCase()).filter(q => q)
    
    if (queries.length > 0) {
        result = result.filter(i => {
            const po = (i.po || '').toLowerCase()
            // Exact match per line as requested, but case-insensitive is safe user expectation
            return queries.includes(po)
        })
    }

    return result
})

// PCS Column Logic
const getPcsInfo = (item) => {
    const currentQty = item.current_qty !== undefined ? item.current_qty : (item.currentQty || 0)
    const size = item.size || ''
    
    return `${currentQty}块 ${size}`
}

const exportToCsv = () => {
    if (filteredStock.value.length === 0) return

    const headers = ['ITEM', '', '', 'PO', 'PROD. NAME', 'REG. DATE', '', 'PCS']
    const csvContent = [
        headers.join(','),
        ...filteredStock.value.map(item => {
            return [
                `"${(item.item_no || item.itemNo || '').replace(/"/g, '""')}"`,
                "",
                "",
                `"${(item.po || '').replace(/"/g, '""')}"`,
                `"${(item.product || '').replace(/"/g, '""')}"`,
                `"${formatDate(item.date_in || item.dateIn)}"`,
                "",
                `"${getPcsInfo(item).replace(/"/g, '""')}"`
            ].join(',')
        })
    ].join('\n')

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `clf_search_results_${new Date().toISOString().slice(0,10)}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}
</script>

<template>
    <div class="space-y-4">
        <!-- Filter Section -->
        <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-slate-700">CLF Search</h2>
                <button 
                    v-if="filteredStock.length > 0"
                    @click="exportToCsv"
                    class="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-emerald-700 shadow-sm flex items-center"
                >
                    <i class="fa-solid fa-file-csv mr-2"></i> Export CSV
                </button>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-400 mb-1">Enter PO Numbers (one per line)</label>
                <textarea 
                    v-model="poFilterInput" 
                    placeholder="Paste PO numbers here..." 
                    rows="5"
                    class="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-teal-500 outline-none"
                ></textarea>
            </div>
            <div class="mt-2 text-right">
                <span class="text-xs text-slate-400">Showing {{ filteredStock.length }} items</span>
                <button 
                    v-if="poFilterInput" 
                    @click="poFilterInput = ''" 
                    class="ml-4 text-xs text-rose-500 hover:underline"
                >
                    Clear Filter
                </button>
            </div>
        </div>

        <!-- Table Section -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
                    <tr>
                        <th class="px-6 py-4 text-center">ITEM</th>
                        <th class="px-6 py-4 text-center"></th> <!-- Spacer -->
                        <th class="px-6 py-4 text-center"></th> <!-- Spacer -->
                        <th class="px-6 py-4 text-center">PO</th>
                        <th class="px-6 py-4 text-center">PROD. NAME</th>
                        <th class="px-6 py-4 text-center">REG. DATE</th>
                        <th class="px-6 py-4 text-center"></th> <!-- Spacer -->
                        <th class="px-6 py-4 text-center">PCS</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-700">
                    <tr v-for="item in filteredStock" :key="item.id" class="hover:bg-slate-50">
                        <td class="px-6 py-3 text-center font-medium">{{ item.item_no || item.itemNo }}</td>
                        <td class="px-6 py-3 text-center"></td>
                        <td class="px-6 py-3 text-center"></td>
                        <td class="px-6 py-3 text-center font-bold text-teal-600">{{ item.po }}</td>
                        <td class="px-6 py-3 text-center font-medium">{{ item.product }}</td>
                        <td class="px-6 py-3 text-center whitespace-nowrap">{{ formatDate(item.date_in || item.dateIn) }}</td>
                        <td class="px-6 py-3 text-center"></td>
                        <td class="px-6 py-3 text-center font-mono text-xs">{{ getPcsInfo(item) }}</td>
                    </tr>
                </tbody>
            </table>
            <div v-if="filteredStock.length === 0" class="p-8 text-center text-slate-400">
                No items found matching the PO filter.
            </div>
        </div>
    </div>
</template>
