<script setup>
import { ref, onMounted, computed } from 'vue'
import { useInventoryStore } from '../stores/inventory'

const store = useInventoryStore()
const activeTab = ref('stock') // 'stock' or 'history'
const selectedStock = ref([])
const selectedHistory = ref([])

const setActiveTab = (tab) => {
    activeTab.value = tab
    // Clear selection when switching tabs to avoid confusion
    selectedStock.value = []
    selectedHistory.value = []
}

const trashItems = ref({ inventory: [], shipments: [] })
const loading = ref(false)
const filter = ref('')

// Computed Selection
const selectedCount = computed(() => {
    return activeTab.value === 'stock' ? selectedStock.value.length : selectedHistory.value.length
})

const isAllSelected = computed(() => {
    const list = activeTab.value === 'stock' ? filteredInventory.value : filteredShipments.value
    if (list.length === 0) return false
    const selected = activeTab.value === 'stock' ? selectedStock.value : selectedHistory.value
    return selected.length === list.length
})

const toggleSelectAll = (checked) => {
    const list = activeTab.value === 'stock' ? filteredInventory.value : filteredShipments.value
    if (checked) {
        if (activeTab.value === 'stock') {
            selectedStock.value = list.map(i => i.id)
        } else {
            selectedHistory.value = list.map(i => i.id)
        }
    } else {
        if (activeTab.value === 'stock') {
            selectedStock.value = []
        } else {
            selectedHistory.value = []
        }
    }
}

// Batch Actions
const batchRestore = async () => {
    if (!confirm(`Restore ${selectedCount.value} items?`)) return
    
    // We loop for now as store doesn't support batch API yet
    // Improve: Add batch API later if fast enough
    const ids = activeTab.value === 'stock' ? [...selectedStock.value] : [...selectedHistory.value]
    
    try {
        for (const id of ids) {
            if (activeTab.value === 'stock') {
                await store.restoreStock(id)
            } else {
                await store.restoreShipment(id)
            }
        }
        // Clear selection
        if (activeTab.value === 'stock') selectedStock.value = []
        else selectedHistory.value = []
        
        await fetchTrash()
    } catch (e) {
        alert('Batch restore failed: ' + e.message)
    }
}

const batchDelete = async () => {
    if (!confirm(`PERMANENTLY DELETE ${selectedCount.value} items? This cannot be undone.`)) return
    
    const ids = activeTab.value === 'stock' ? [...selectedStock.value] : [...selectedHistory.value]
    
    try {
        for (const id of ids) {
             if (activeTab.value === 'stock') {
                await store.permanentDelete(id)
            } else {
                await store.permanentDeleteShipment(id)
            }
        }
        // Clear selection
        if (activeTab.value === 'stock') selectedStock.value = []
        else selectedHistory.value = []

        await fetchTrash()
    } catch (e) {
        alert('Batch delete failed: ' + e.message)
    }
}

const filteredInventory = computed(() => {
    if (!filter.value) return trashItems.value.inventory
    const q = filter.value.toLowerCase()
    return trashItems.value.inventory.filter(i => 
        (i.po||'').toLowerCase().includes(q) || 
        (i.client||'').toLowerCase().includes(q) || 
        (i.product||'').toLowerCase().includes(q)
    )
})

const filteredShipments = computed(() => {
    if (!filter.value) return trashItems.value.shipments
    const q = filter.value.toLowerCase()
    return trashItems.value.shipments.filter(i => 
        (i.po||'').toLowerCase().includes(q) || 
        (i.client||'').toLowerCase().includes(q) ||
        (i.product||'').toLowerCase().includes(q)
    )
})

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
                    @click="setActiveTab('stock')"
                    class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    :class="activeTab === 'stock' ? 'bg-white text-teal-600 shadow' : 'text-slate-500 hover:text-slate-700'"
                >
                    Deleted Stock
                </button>
                <button 
                    @click="setActiveTab('history')"
                    class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    :class="activeTab === 'history' ? 'bg-white text-teal-600 shadow' : 'text-slate-500 hover:text-slate-700'"
                >
                    Deleted History
                </button>
            </div>
        </div>

        <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <input v-model="filter" placeholder="Search PO, Client, or Product..." class="w-full border border-slate-300 rounded px-2 py-2 text-sm focus:border-teal-500 outline-none">
            
            <!-- Bulk Action Bar -->
            <div v-if="selectedCount > 0" class="mt-4 flex items-center bg-indigo-50 p-2 rounded-lg border border-indigo-100 animate-fade-in-up">
                <span class="text-sm font-bold text-indigo-800 mr-4">{{ selectedCount }} selected</span>
                <button @click="batchRestore" class="bg-teal-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-teal-700 mr-2 shadow-sm">
                    <i class="fa-solid fa-trash-arrow-up mr-1"></i> Restore Selected
                </button>
                <button @click="batchDelete" class="bg-rose-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-rose-600 shadow-sm">
                    <i class="fa-solid fa-ban mr-1"></i> Delete Forever
                </button>
            </div>
        </div>

        <div v-if="loading" class="text-center py-10 text-slate-400">Loading...</div>

        <!-- Stock Tab -->
        <div v-if="!loading && activeTab === 'stock'" class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase font-semibold">
                    <tr>
                        <th class="px-6 py-4 w-10">
                            <input type="checkbox" :checked="isAllSelected" @change="e => toggleSelectAll(e.target.checked)" class="rounded text-indigo-600 focus:ring-indigo-500">
                        </th>
                        <th class="px-6 py-4">Deleted At</th>
                        <th class="px-6 py-4">Client</th>
                        <th class="px-6 py-4">PO</th>
                        <th class="px-6 py-4">Product</th>
                        <th class="px-6 py-4">Size</th>
                        <th class="px-6 py-4">Details</th>
                        <th class="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr v-for="item in filteredInventory" :key="item.id">
                        <td class="px-6 py-3">
                            <input type="checkbox" v-model="selectedStock" :value="item.id" class="rounded text-indigo-600 focus:ring-indigo-500">
                        </td>
                        <td class="px-6 py-3 text-slate-500">{{ item.deleted_at }}</td>
                        <td class="px-6 py-3 font-medium text-slate-600">{{ item.client }}</td>
                        <td class="px-6 py-3 font-medium">{{ item.po }}</td>
                        <td class="px-6 py-3">
                            <div class="font-medium">{{ item.product }}</div>
                            <div class="text-xs text-slate-500">{{ item.item_no }}</div>
                        </td>
                        <td class="px-6 py-3 font-medium text-slate-600">{{ item.size }}</td>
                        <td class="px-6 py-3 text-xs text-slate-400">Qty: {{ item.current_qty }} | Note: {{ item.note }}</td>
                        <td class="px-6 py-3 text-right space-x-2">
                            <button @click="restoreItem(item.id, 'stock')" class="text-teal-600 hover:text-teal-800 font-medium">Restore</button>
                            <button @click="deletePermanently(item.id, 'stock')" class="text-rose-500 hover:text-rose-700 font-medium">Delete Forever</button>
                        </td>
                    </tr>
                    <tr v-if="trashItems.inventory.length === 0">
                        <td colspan="7" class="px-6 py-8 text-center text-slate-400">Trash is empty.</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- History Tab -->
        <div v-if="!loading && activeTab === 'history'" class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase font-semibold">
                    <tr>
                        <th class="px-6 py-4 w-10">
                            <input type="checkbox" :checked="isAllSelected" @change="e => toggleSelectAll(e.target.checked)" class="rounded text-indigo-600 focus:ring-indigo-500">
                        </th>
                        <th class="px-6 py-4">Deleted At</th>
                        <th class="px-6 py-4">Date Sent</th>
                        <th class="px-6 py-4">Client</th>
                        <th class="px-6 py-4">PO</th>
                        <th class="px-6 py-4">Product/Size</th>
                        <th class="px-6 py-4">Recipient</th>
                        <th class="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr v-for="item in filteredShipments" :key="item.id">
                        <td class="px-6 py-3">
                            <input type="checkbox" v-model="selectedHistory" :value="item.id" class="rounded text-indigo-600 focus:ring-indigo-500">
                        </td>
                        <td class="px-6 py-3 text-slate-500">{{ item.deleted_at }}</td>
                        <td class="px-6 py-3">{{ item.date_sent }}</td>
                        <td class="px-6 py-3 font-medium text-slate-600">{{ item.client }}</td>
                        <td class="px-6 py-3 font-medium">{{ item.po }}</td>
                        <td class="px-6 py-3">
                            <div class="text-sm">{{ item.product }}</div>
                            <div class="text-xs text-slate-500">{{ item.size }}</div>
                        </td>
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
                        <td colspan="7" class="px-6 py-8 text-center text-slate-400">No deleted history.</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
