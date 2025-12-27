<script setup>
import { ref, computed, onMounted } from 'vue'
import { useInventoryStore } from '../stores/inventory'
import ImportModal from '../components/ImportModal.vue'

const store = useInventoryStore()
// Filters


const selected = ref([])
const filters = ref({
    dateStart: '',
    dateEnd: '',
    client: '',
    po: '',
    product: '',
    recipient: '',
    tracking: ''
})

onMounted(() => {
    store.fetchAll()
})

const filteredHistory = computed(() => {
    let result = store.shipments

    // Filter by Date Range
    if (filters.value.dateStart) {
        result = result.filter(s => s.date_sent >= filters.value.dateStart)
    }
    if (filters.value.dateEnd) {
        result = result.filter(s => s.date_sent <= filters.value.dateEnd)
    }

    // Filter by PO (Multi-line)
    if (filters.value.po.trim()) {
        const queries = filters.value.po.split('\n').map(q => q.trim().toLowerCase()).filter(q => q)
        if (queries.length > 0) {
            result = result.filter(s => {
                const po = (s.po || '').toLowerCase()
                return queries.some(q => po.includes(q))
            })
        }
    }

    // Filter by Client
    if (filters.value.client.trim()) {
        const query = filters.value.client.trim().toLowerCase()
        result = result.filter(s => (s.client || '').toLowerCase().includes(query))
    }

    // Filter by Product
    if (filters.value.product.trim()) {
        const query = filters.value.product.trim().toLowerCase()
        result = result.filter(s => (s.product || '').toLowerCase().includes(query))
    }

    // Filter by Recipient
    if (filters.value.recipient.trim()) {
        const query = filters.value.recipient.trim().toLowerCase()
        result = result.filter(s => (s.recipient || '').toLowerCase().includes(query))
    }

    // Filter by Tracking
    if (filters.value.tracking.trim()) {
        const query = filters.value.tracking.trim().toLowerCase()
        // Check both courier and tracking number and Recipient
        result = result.filter(s => 
            (s.tracking || '').toLowerCase().includes(query) ||
            (s.courier || '').toLowerCase().includes(query) ||
            (s.recipient || '').toLowerCase().includes(query)
        )
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

const isAllSelected = computed(() => {
    return filteredHistory.value.length > 0 && selected.value.length === filteredHistory.value.length
})

const toggleSelectAll = (e) => {
    if (e.target.checked) {
        selected.value = filteredHistory.value.map(s => s.id)
    } else {
        selected.value = []
    }
}

const revertSelected = async () => {
    if (selected.value.length === 0) return
    if (!confirm(`Are you sure you want to revert ${selected.value.length} shipments? Stock will be restored for all of them.`)) return
    
    try {
        await store.revertShipments(selected.value)
        selected.value = [] // Clear selection
    } catch (e) {
        alert('Error: ' + e.message)
    }
}

const batchDelete = async () => {
    if (!confirm(`Move ${selected.value.length} History items to Trash?`)) return
    try {
        for (const id of selected.value) {
            await store.deleteShipment(id)
        }
        selected.value = []
        store.fetchAll()
    } catch (e) {
        alert('Batch delete failed: ' + e.message)
    }
}

const exportHistory = async () => {
    try {
        await store.exportHistoryTemplate(selected.value)
        selected.value = []
    } catch (e) {
        alert('Export failed: ' + e.message)
    }
}

const copyToClipboard = async (field) => {
    // Find items in the full history or filtered history
    // Using filteredHistory ensures we find them even if search is active
    const items = filteredHistory.value.filter(s => selected.value.includes(s.id))
    if (items.length === 0) return

    let values = []
    if (field === 'po') values = items.map(s => s.po)
    else if (field === 'client') values = items.map(s => s.client)
    else if (field === 'product') values = items.map(s => s.product)
    else if (field === 'tracking') values = items.map(s => s.tracking)
    
    // Filter empty
    values = values.filter(v => v)

    if (values.length === 0) {
        alert('No data found for the selected items.')
        return
    }

    const text = values.join('\n')
    try {
        await navigator.clipboard.writeText(text)
        alert(`Copied ${values.length} items to clipboard!`)
    } catch (err) {
        console.error('Failed to copy: ', err)
        alert('Failed to copy to clipboard.')
    }
}

// Import Modal
const showImportModal = ref(false)
const openImport = () => {
    showImportModal.value = true
}
const handleImportSuccess = () => {
    store.fetchAll()
}
</script>

<template>
    <div class="space-y-6">
        <ImportModal 
            :show="showImportModal" 
            target="history" 
            @close="showImportModal = false" 
            @refresh="handleImportSuccess" 
        />
        <!-- Search Filters -->
        <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div class="flex justify-between items-center mb-3">
                <h2 class="text-sm font-bold text-slate-500 uppercase">Search History</h2>
                <div class="flex">
                     <button @click="openImport" class="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-indigo-700 mr-2">
                        <i class="fa-solid fa-file-import mr-1"></i> Import
                    </button>
                    <button 
                        v-if="selected.length > 0" 
                        @click="batchDelete" 
                        class="bg-rose-500 text-white px-3 py-1 rounded shadow-md text-xs font-bold hover:bg-rose-600 transition-colors mr-2"
                    >
                        <i class="fa-solid fa-trash mr-1"></i> Delete {{ selected.length }}
                    </button>
                    <button 
                        v-if="selected.length > 0" 
                        @click="revertSelected" 
                        class="bg-amber-500 text-white px-3 py-1 rounded shadow-md text-xs font-bold hover:bg-amber-600 transition-colors mr-2"
                    >
                        <i class="fa-solid fa-rotate-left mr-1"></i> Revert {{ selected.length }}
                    </button>
                    
                     <!-- Copy Dropdown Group -->
                    <div v-if="selected.length > 0" class="relative group mr-2 inline-block">
                        <button class="bg-slate-700 text-white px-3 py-1 rounded shadow-md text-xs font-bold hover:bg-slate-800 transition-colors">
                            <i class="fa-solid fa-copy mr-1"></i> Copy Info
                        </button>
                        <div class="absolute right-0 top-full mt-1 w-40 bg-white rounded shadow-xl border border-slate-200 hidden group-hover:block z-50 overflow-hidden">
                            <a @click="copyToClipboard('po')" class="block px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 cursor-pointer">Copy POs</a>
                            <a @click="copyToClipboard('tracking')" class="block px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 cursor-pointer">Copy Tracking</a>
                            <a @click="copyToClipboard('product')" class="block px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 cursor-pointer">Copy Products</a>
                        </div>
                    </div>

                    <button 
                        v-if="selected.length > 0" 
                        @click="exportHistory" 
                        class="bg-emerald-600 text-white px-3 py-1 rounded shadow-md text-xs font-bold hover:bg-emerald-700 transition-colors"
                    >
                    <i class="fa-solid fa-file-excel mr-1"></i> Export Template
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1">Date Range (Sent)</label>
                    <div class="flex space-x-2">
                         <input type="date" v-model="filters.dateStart" class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-teal-500 outline-none" placeholder="From">
                         <input type="date" v-model="filters.dateEnd" class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-teal-500 outline-none" placeholder="To">
                    </div>
                </div>
                 <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1">Client Name</label>
                    <input type="text" v-model="filters.client" placeholder="Search Client..." class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-teal-500 outline-none">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1">PO Number (One per line)</label>
                    <textarea 
                        v-model="filters.po" 
                        placeholder="Search POs..." 
                        rows="1"
                        class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-teal-500 outline-none min-h-[38px] max-h-[120px]"
                    ></textarea>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-400 mb-1">Product Name</label>
                    <input type="text" v-model="filters.product" placeholder="Search Product..." class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-teal-500 outline-none">
                </div>
                <div>
                     <label class="block text-xs font-bold text-slate-400 mb-1">Recipient / Tracking</label>
                    <input type="text" v-model="filters.tracking" placeholder="Search Recipient or Tracking..." class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-teal-500 outline-none">
                </div>
            </div>
            <!-- Clear Filters Button if any active -->
            <div v-if="filters.dateStart || filters.dateEnd || filters.po || filters.product || filters.client || filters.recipient" class="mt-2 text-right">
                <button @click="filters = { dateStart: '', dateEnd: '', po: '', client: '', product: '', recipient: '' }" class="text-xs text-rose-500 hover:underline">Clear Filters</button>
            </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider">
                    <tr>
                        <th class="px-6 py-3 w-4">
                            <input type="checkbox" @change="toggleSelectAll" :checked="isAllSelected" class="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500 cursor-pointer">
                        </th>
                        <th class="px-6 py-3">Date Sent</th>
                        <th class="px-6 py-3">Client</th>
                        <th class="px-6 py-3">Reference (PO)</th>
                        <th class="px-6 py-3">Product</th>
                        <th class="px-6 py-3">Size</th>
                        <th class="px-4 py-3 text-center">Qty</th>
                        <th class="px-6 py-3">Recipient</th>
                        <th class="px-6 py-3">Logistics</th>
                        <th class="px-6 py-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr v-for="ship in filteredHistory" :key="ship.id" :class="selected.includes(ship.id) ? 'bg-rose-50' : 'even:bg-gray-100 hover:bg-gray-200 transition-colors'">
                        <td class="px-6 py-3">
                            <input type="checkbox" v-model="selected" :value="ship.id" class="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500 cursor-pointer">
                        </td>
                        <td class="px-6 py-3 whitespace-nowrap text-slate-500">{{ ship.date_sent }}</td>
                        <td class="px-6 py-3 font-medium text-slate-600">{{ ship.client }}</td>
                        <td class="px-6 py-3 font-bold text-slate-700">{{ ship.po }}</td>
                        <td class="px-6 py-3 text-xs text-slate-500">{{ ship.product }}</td>
                        <td class="px-6 py-3 text-xs text-slate-500">{{ ship.size }}</td>
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
