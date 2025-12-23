<script setup>
import { ref, onMounted } from 'vue'
import { useInventoryStore } from '../stores/inventory'

const store = useInventoryStore()
const activeTab = ref('stock') // 'stock' or 'history'
const trashItems = ref({ inventory: [], shipments: [] })
const loading = ref(false)

const fetchTrash = async () => {
    loading.value = true
    try {
        const data = await store.fetchTrash()
        trashItems.value = data
    } catch (e) {
        alert('Failed to load trash: ' + e.message)
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    fetchTrash()
})

const restoreItem = async (id, type) => {
    if (!confirm('Restore this item?')) return
    try {
        if (type === 'stock') {
            await store.restoreStock(id)
        } else {
            await store.restoreShipment(id)
        }
        await fetchTrash() // Refresh list
    } catch (e) {
        alert('Restore failed: ' + e.message)
    }
}

const deletePermanently = async (id, type) => {
    if (!confirm('PERMANENTLY DELETE? This cannot be undone.')) return
    try {
        if (type === 'stock') {
            await store.permanentDelete(id)
        } else {
            await store.permanentDeleteShipment(id)
        }
        await fetchTrash()
    } catch (e) {
        alert('Delete failed: ' + e.message)
    }
}
</script>

<template>
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <h2 class="text-2xl font-bold text-slate-800">Recycle Bin</h2>
            <div class="flex bg-slate-100 p-1 rounded-lg">
                <button 
                    @click="activeTab = 'stock'"
                    class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    :class="activeTab === 'stock' ? 'bg-white text-teal-600 shadow' : 'text-slate-500 hover:text-slate-700'"
                >
                    Deleted Stock
                </button>
                <button 
                    @click="activeTab = 'history'"
                    class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    :class="activeTab === 'history' ? 'bg-white text-teal-600 shadow' : 'text-slate-500 hover:text-slate-700'"
                >
                    Deleted History
                </button>
            </div>
        </div>

        <div v-if="loading" class="text-center py-10 text-slate-400">Loading...</div>

        <!-- Stock Tab -->
        <div v-if="!loading && activeTab === 'stock'" class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase font-semibold">
                    <tr>
                        <th class="px-6 py-4">Deleted At</th>
                        <th class="px-6 py-4">PO</th>
                        <th class="px-6 py-4">Product</th>
                        <th class="px-6 py-4">Details</th>
                        <th class="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr v-for="item in trashItems.inventory" :key="item.id">
                        <td class="px-6 py-3 text-slate-500">{{ item.deleted_at }}</td>
                        <td class="px-6 py-3 font-medium">{{ item.po }}</td>
                        <td class="px-6 py-3">{{ item.product }} - {{ item.item_no }} ({{ item.size }})</td>
                        <td class="px-6 py-3 text-xs text-slate-400">Qty: {{ item.current_qty }} | Note: {{ item.note }}</td>
                        <td class="px-6 py-3 text-right space-x-2">
                            <button @click="restoreItem(item.id, 'stock')" class="text-teal-600 hover:text-teal-800 font-medium">Restore</button>
                            <button @click="deletePermanently(item.id, 'stock')" class="text-rose-500 hover:text-rose-700 font-medium">Delete Forever</button>
                        </td>
                    </tr>
                    <tr v-if="trashItems.inventory.length === 0">
                        <td colspan="5" class="px-6 py-8 text-center text-slate-400">Trash is empty.</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- History Tab -->
        <div v-if="!loading && activeTab === 'history'" class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase font-semibold">
                    <tr>
                        <th class="px-6 py-4">Deleted At</th>
                        <th class="px-6 py-4">Date Sent</th>
                        <th class="px-6 py-4">PO</th>
                        <th class="px-6 py-4">Recipient</th>
                        <th class="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr v-for="item in trashItems.shipments" :key="item.id">
                        <td class="px-6 py-3 text-slate-500">{{ item.deleted_at }}</td>
                        <td class="px-6 py-3">{{ item.date_sent }}</td>
                        <td class="px-6 py-3 font-medium">{{ item.po }}</td>
                        <td class="px-6 py-3">
                            <div>{{ item.recipient }}</div>
                            <div class="text-xs text-slate-400">{{ item.courier }} - {{ item.tracking }}</div>
                        </td>
                        <td class="px-6 py-3 text-right space-x-2">
                            <button @click="restoreItem(item.id, 'history')" class="text-teal-600 hover:text-teal-800 font-medium">Restore</button>
                            <button @click="deletePermanently(item.id, 'history')" class="text-rose-500 hover:text-rose-700 font-medium">Delete Forever</button>
                        </td>
                    </tr>
                     <tr v-if="trashItems.shipments.length === 0">
                        <td colspan="5" class="px-6 py-8 text-center text-slate-400">No deleted history.</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
