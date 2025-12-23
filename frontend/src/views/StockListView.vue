<script setup>
import { ref, computed, onMounted } from 'vue'
import { useInventoryStore } from '../stores/inventory'
import { useRouter } from 'vue-router'

const store = useInventoryStore()
const router = useRouter()

const selected = ref([])
const editModal = ref({ show: false, data: { id: null, originalQty: 0, note: '' } })

// Search Filters
const filters = ref({
    date: '',
    po: '',
    product: ''
})

onMounted(() => {
    store.fetchAll()
})

const filteredStock = computed(() => {
    let result = store.currentInventory

    // Filter by Date
    if (filters.value.date) {
        // Assuming date_in is relevant. Note: Format checking might be needed if date_in varies.
        result = result.filter(i => (i.date_in || i.dateIn) === filters.value.date)
    }

    // Filter by PO
    if (filters.value.po.trim()) {
        const query = filters.value.po.trim().toLowerCase()
        result = result.filter(i => (i.po || '').toLowerCase().includes(query))
    }

    // Filter by Product
    if (filters.value.product.trim()) {
        const query = filters.value.product.trim().toLowerCase()
        result = result.filter(i => (i.product || '').toLowerCase().includes(query))
    }
    
    return result
})


const isAllSelected = computed(() => {
    return filteredStock.value.length > 0 && selected.value.length === filteredStock.value.length
})

const toggleSelectAll = (e) => {
    if (e.target.checked) {
        selected.value = filteredStock.value.map(i => i.id)
    } else {
        selected.value = []
    }
}

const openEditModal = (item) => {
    editModal.value.data = { ...item, originalQty: item.original_qty || item.originalQty }
    editModal.value.show = true
}

const saveEdit = async () => {
    try {
        await store.updateStock(editModal.value.data.id, {
            originalQty: editModal.value.data.originalQty,
            note: editModal.value.data.note
        })
        editModal.value.show = false
    } catch (e) {
        alert('Update failed: ' + e.message)
    }
}

const addToDraft = () => {
    const items = store.currentInventory.filter(i => selected.value.includes(i.id))
    store.addToDraft(items)
    selected.value = []
    router.push('/draft')
}
const deleteItem = async (id) => {
    if (!confirm('Are you sure you want to delete this item?')) return
    try {
        await store.deleteStock(id)
    } catch (e) {
        alert('Delete failed: ' + e.message)
    }
}
</script>

<template>
    <div class="space-y-4">
        <!-- Dashboard / Filter Header -->
        <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4">
             <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-slate-700">Stock Inventory</h2>
                <!-- Bulk Actions -->
                <div class="flex space-x-2">
                        <div v-if="selected.length > 0" class="bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center animate-bounce">
                            <span class="mr-3 font-bold">{{ selected.length }} Selected</span>
                            <button @click="addToDraft" class="bg-teal-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-teal-700">
                                Add to Express Draft
                            </button>
                        </div>
                </div>
            </div>

            <!-- Filters -->
             <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1">Date In</label>
                    <input type="date" v-model="filters.date" class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-teal-500 outline-none">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1">PO Number</label>
                    <input type="text" v-model="filters.po" placeholder="Search PO..." class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-teal-500 outline-none">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1">Product Name</label>
                    <input type="text" v-model="filters.product" placeholder="Search Product..." class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-teal-500 outline-none">
                </div>
            </div>
            <div v-if="filters.date || filters.po || filters.product" class="mt-2 text-right">
                <button @click="filters = { date: '', po: '', product: '' }" class="text-xs text-rose-500 hover:underline">Clear Filters</button>
            </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
                    <tr>
                        <th class="px-6 py-4">
                            <input type="checkbox" @change="toggleSelectAll" :checked="isAllSelected" class="w-5 h-5 text-teal-600 rounded border-gray-300 focus:ring-teal-500 cursor-pointer">
                        </th>
                        <th class="px-6 py-4">Date In</th>
                        <th class="px-6 py-4">PO / Client PO</th>
                        <th class="px-6 py-4">Product / Item</th>
                        <th class="px-6 py-4">Batch / Note</th>
                        <th class="px-6 py-4 text-center">Orig Qty</th>
                        <th class="px-4 py-4 text-center">Curr Qty</th>
                        <th class="px-6 py-4 text-center">Status</th>
                        <th class="px-6 py-4">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-700">
                    <tr v-for="item in filteredStock" :key="item.id" :class="{'bg-indigo-50': selected.includes(item.id)}">
                        <td class="px-6 py-3">
                            <input type="checkbox" v-model="selected" :value="item.id" class="w-5 h-5 text-teal-600 rounded border-gray-300 focus:ring-teal-500 cursor-pointer">
                        </td>
                        <td class="px-6 py-3 whitespace-nowrap">{{ item.date_in || item.dateIn }}</td>
                        <td class="px-6 py-3">
                            <div class="font-bold text-teal-600">{{ item.po }}</div>
                            <div class="text-xs text-slate-400">{{ item.client_po || item.clientPO }}</div>
                        </td>
                        <td class="px-6 py-3">
                            <div class="font-medium">{{ item.product }}</div>
                            <div class="text-xs text-slate-500">{{ item.item_no || item.itemNo }} ({{ item.size }})</div>
                        </td>
                        <td class="px-6 py-3 max-w-xs truncate" :title="item.note">
                            <div class="text-xs font-mono bg-slate-100 inline p-1 rounded">{{ item.batch }}</div>
                            <div class="text-xs text-slate-400 mt-1 truncate">{{ item.note }}</div>
                        </td>
                        <td class="px-6 py-3 text-center text-slate-400">{{ item.original_qty || item.originalQty }}</td>
                        <td class="px-4 py-3 text-center font-bold text-lg" :class="(item.current_qty || item.currentQty) > 0 ? 'text-emerald-500' : 'text-slate-300'">
                            {{ item.current_qty !== undefined ? item.current_qty : item.currentQty }}
                        </td>
                        <td class="px-6 py-3 text-center">
                            <span 
                                class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                                :class="(item.current_qty || item.currentQty || 0) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'"
                            >
                                {{ (item.current_qty || item.currentQty || 0) > 0 ? 'Available' : 'Out of Stock' }}
                            </span>
                        </td>
                        <td class="px-6 py-3 flex space-x-3">
                            <button @click="openEditModal(item)" class="text-slate-400 hover:text-teal-500 transition-colors" title="Edit">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button @click="deleteItem(item.id)" class="text-slate-400 hover:text-rose-500 transition-colors" title="Delete">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div v-if="store.currentInventory.length === 0" class="p-8 text-center text-slate-400">
                No items in inventory. Go to "Stock In" to add items.
            </div>
        </div>

        <!-- Edit Modal -->
        <div v-if="editModal.show" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-2xl w-96 p-6">
                <h3 class="text-lg font-bold mb-4">Edit Inventory Item</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase">Original Qty</label>
                        <input type="number" v-model.number="editModal.data.originalQty" class="w-full border p-2 rounded">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase">Note</label>
                        <textarea v-model="editModal.data.note" class="w-full border p-2 rounded" rows="3"></textarea>
                    </div>
                </div>
                <div class="flex justify-end space-x-2 mt-6">
                    <button @click="editModal.show = false" class="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
                    <button @click="saveEdit" class="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700">Save Changes</button>
                </div>
            </div>
        </div>
    </div>
</template>
