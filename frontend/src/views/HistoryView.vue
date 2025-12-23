<script setup>
import { ref, computed, onMounted } from 'vue'
import { useInventoryStore } from '../stores/inventory'

const store = useInventoryStore()
// Filters
const filters = ref({
    date: '',
    po: '',
    product: ''
})

onMounted(() => {
    store.fetchAll()
})

const filteredHistory = computed(() => {
    let result = store.shipments

    // Filter by Date
    if (filters.value.date) {
        result = result.filter(s => s.date_sent === filters.value.date)
    }

    // Filter by PO
    if (filters.value.po.trim()) {
        const query = filters.value.po.trim().toLowerCase()
        result = result.filter(s => (s.po || '').toLowerCase().includes(query))
    }

    // Filter by Product
    if (filters.value.product.trim()) {
        const query = filters.value.product.trim().toLowerCase()
        result = result.filter(s => (s.product || '').toLowerCase().includes(query))
    }

    // Sort Descending Date
    return [...result].sort((a,b) => new Date(b.date_sent) - new Date(a.date_sent))
})

const getImageUrl = (path) => {
    if (!path) return null
    return `http://localhost:3000/${path}`
}

const revertShipment = async (shipment) => {
    if (!confirm("Are you sure you want to revert this shipment? Stock will be restored.")) return
    try {
        await store.revertShipment(shipment.id)
    } catch (e) {
        alert('Error: ' + e.message)
    }
}
</script>

<template>
    <div class="space-y-6">
        <!-- Search Filters -->
        <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h2 class="text-sm font-bold text-slate-500 uppercase mb-3">Search History</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1">Date Sent</label>
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
            <!-- Clear Filters Button if any active -->
            <div v-if="filters.date || filters.po || filters.product" class="mt-2 text-right">
                <button @click="filters = { date: '', po: '', product: '' }" class="text-xs text-rose-500 hover:underline">Clear Filters</button>
            </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider">
                    <tr>
                        <th class="px-6 py-3">Date Sent</th>
                        <th class="px-6 py-3">Reference (PO)</th>
                        <th class="px-6 py-3">Product</th>
                        <th class="px-4 py-3 text-center">Qty</th>
                        <th class="px-6 py-3">Recipient</th>
                        <th class="px-6 py-3">Logistics</th>
                        <th class="px-6 py-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr v-for="ship in filteredHistory" :key="ship.id">
                        <td class="px-6 py-3 whitespace-nowrap text-slate-500">{{ ship.date_sent }}</td>
                        <td class="px-6 py-3 font-bold text-slate-700">{{ ship.po }}</td>
                        <td class="px-6 py-3 text-xs text-slate-500">{{ ship.product }}</td>
                        <td class="px-4 py-3 text-center font-bold text-teal-600">{{ ship.qty > 1 ? ship.qty : 1 }}</td>
                        <td class="px-6 py-3">{{ ship.recipient }}</td>
                        <td class="px-6 py-3">
                            <div class="flex flex-col">
                                <div>
                                    <span class="px-2 py-1 rounded bg-slate-100 text-xs font-bold">{{ ship.courier }}</span>
                                    <span class="ml-2 font-mono text-xs">{{ ship.tracking }}</span>
                                </div>
                                <div v-if="ship.image_path" class="mt-1">
                                    <a :href="getImageUrl(ship.image_path)" target="_blank" class="text-teal-600 hover:underline text-xs flex items-center">
                                        <i class="fa-solid fa-paperclip mr-1"></i> View Photo
                                    </a>
                                </div>
                            </div>
                        </td>
                        <td class="px-6 py-3 text-right">
                            <button @click="revertShipment(ship)" class="text-rose-500 hover:text-rose-700 text-xs font-bold border border-rose-200 hover:bg-rose-50 px-2 py-1 rounded transition-colors">
                                Revert & Restore Stock
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div v-if="filteredHistory.length === 0" class="p-6 text-center text-slate-400">
                No matching shipment records found.
            </div>
        </div>
    </div>
</template>
