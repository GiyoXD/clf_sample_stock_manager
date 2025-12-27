<script setup>
import { ref, onMounted } from 'vue'
import { useInventoryStore } from '../stores/inventory'

const store = useInventoryStore()

const searchPO = ref('')
const duplicates = ref([])
const relatedPOs = ref([])
const recentEntries = ref([])
const form = ref({
    po: '',
    client: '',
    clientPO: '',
    product: '',
    itemNo: '',
    batch: '',
    note: '',
    note: '',
    date: (() => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0, 16);
    })(),
    qty: 1,
    size: 'A3'
})

// Ensure data is loaded
onMounted(() => {
    store.fetchAll()
})

const handleSearch = () => {
    const searchKey = searchPO.value.trim().toLowerCase()
    if (!searchKey) return

    // Search Master Data (flexible match)
    // Refactored to using_po
    const masterRecord = store.masterData.find(r => String(r.using_po || '').toLowerCase() === searchKey)
    
    // Search CLF Data
    const clfRecord = store.clfData.find(r => String(r['TTX单号'] || '').toLowerCase() === searchKey)

    if (!masterRecord && !clfRecord) {
        alert('PO not found in database. Please enter details manually.')
        // Keep PO but clear others
        form.value = {
            ...form.value,
            po: searchPO.value.toUpperCase(),
            client: '', clientPO: '', product: '', itemNo: '', batch: '', note: ''
        }
    } else {
        form.value.po = masterRecord ? masterRecord.using_po : (clfRecord ? clfRecord['TTX单号'] : searchKey.toUpperCase())
        form.value.client = masterRecord ? masterRecord.client : ''
        form.value.product = masterRecord ? masterRecord.product_name : ''
        form.value.itemNo = masterRecord ? masterRecord.product_code : ''
        form.value.note = '' // User requested empty note by default
        
        form.value.batch = clfRecord ? clfRecord['批次'] : ''
        form.value.clientPO = masterRecord ? masterRecord.client_po : (clfRecord ? clfRecord['PO'] : '')
    }

    // Check Duplicates
    duplicates.value = store.inventory
        .filter(i => String(i.po).toLowerCase() === searchKey)
        .map(i => ({ dateText: i.date_in, qty: i.original_qty || i.originalQty, size: i.size }))

    // Check Related POs / Sub-POs (Warning)
    const related = new Set()
    
    // Check Master Data for suffix matches
    store.masterData.forEach(r => {
        const po = String(r.using_po || '').toLowerCase()
        if (po.length > searchKey.length && po.startsWith(searchKey)) {
            related.add(r.using_po)
        }
    })

    // Check Inventory for suffix matches
    store.inventory.forEach(i => {
        const po = String(i.po || '').toLowerCase()
        if (po.length > searchKey.length && po.startsWith(searchKey)) {
            related.add(i.po)
        }
    })

    relatedPOs.value = Array.from(related).sort()
}

const saveStock = async () => {
    if (!form.value.po) return alert('PO is required')
    
    try {
        const newItem = await store.addStock(form.value)
        recentEntries.value.unshift(newItem)
        
        // Reset
        searchPO.value = ''
        duplicates.value = []
        relatedPOs.value = []
        form.value.qty = 1 // Reset qty
        // Keep date/size preferably
    } catch (e) {
        alert('Failed to save: ' + e.message)
    }
}

const undoEntry = async (index, id) => {
    if(!confirm('Undo this entry?')) return
    try {
        await store.deleteStock(id)
        recentEntries.value.splice(index, 1)
    } catch (e) {
        alert('Failed to delete: ' + e.message)
    }
}


</script>

<template>
    <div class="space-y-6">
        <!-- Search Section -->
        <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 class="text-lg font-semibold text-slate-700 mb-4 flex items-center">
                <i class="fa-solid fa-magnifying-glass mr-2 text-teal-500"></i> Search PO
            </h2>
            <div class="relative">
                <input 
                    v-model="searchPO" 
                    @keyup.enter="handleSearch"
                    type="text" 
                    placeholder="Scan or Enter PO Number..." 
                    class="w-full text-lg px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-shadow"
                    autofocus
                >
                <button @click="handleSearch" class="absolute right-2 top-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-md transition-colors">
                    Search
                </button>
            </div>

            <!-- Warning for Related POs -->
            <div v-if="relatedPOs.length > 0" class="mt-4 bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded-r-md">
                <div class="flex">
                    <i class="fa-solid fa-circle-info text-indigo-500 text-xl mr-3"></i>
                    <div>
                        <h3 class="text-indigo-800 font-bold">Related Variations Found!</h3>
                        <p class="text-xs text-indigo-600 mb-1">Did you mean one of these?</p>
                        <div class="flex flex-wrap gap-2 mt-1">
                            <span v-for="po in relatedPOs" :key="po" 
                                @click="searchPO = po; handleSearch()"
                                class="cursor-pointer bg-white border border-indigo-200 text-indigo-700 px-2 py-1 rounded text-xs hover:bg-indigo-100 hover:border-indigo-300 transition-colors font-mono">
                                {{ po }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Warning for Duplicates -->
            <div v-if="duplicates.length > 0" class="mt-4 bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-md">
                <div class="flex">
                    <i class="fa-solid fa-triangle-exclamation text-amber-500 text-xl mr-3"></i>
                    <div>
                        <h3 class="text-amber-800 font-bold">Previous Stock Found!</h3>
                        <ul class="list-disc list-inside text-sm text-amber-700 mt-1">
                            <li v-for="(rec, idx) in duplicates" :key="idx">
                                {{ rec.dateText }}: {{ rec.qty }}pcs ({{ rec.size }})
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <!-- Entry Form -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Found Data Card -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-1">
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Client</label>
                        <input v-model="form.client" class="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-700" readonly>
                    </div>
                    <div class="col-span-1">
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Client PO</label>
                        <input v-model="form.clientPO" class="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-700" readonly>
                    </div>
                    <div class="col-span-2">
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Product Name</label>
                        <input v-model="form.product" class="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-700" readonly>
                    </div>
                    <div class="col-span-1">
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Item No</label>
                        <input v-model="form.itemNo" class="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-700" readonly>
                    </div>
                    <div class="col-span-1">
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Batch</label>
                        <input v-model="form.batch" class="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-700" readonly>
                    </div>
                    <div class="col-span-2">
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Quality Note (Editable)</label>
                        <textarea v-model="form.note" rows="3" class="w-full border border-slate-300 rounded px-3 py-2 text-slate-700 focus:border-teal-500 outline-none"></textarea>
                    </div>
                </div>
            </div>

            <!-- Action Card -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Date In</label>
                        <input type="datetime-local" v-model="form.date" class="w-full border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-teal-500 outline-none">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                            <input type="number" v-model.number="form.qty" min="1" class="w-full border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-teal-500 outline-none">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Size</label>
                            <select v-model="form.size" class="w-full border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-teal-500 outline-none">
                                <option value="A3">A3</option>
                                <option value="50*50">50*50</option>
                                <option value="Whole Hide">Whole Hide</option>
                            </select>
                        </div>
                    </div>
                </div>
                <button @click="saveStock" class="mt-6 w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg shadow-md hover:shadow-lg transition-all flex justify-center items-center">
                    <i class="fa-solid fa-floppy-disk mr-2"></i> Save to Inventory
                </button>
            </div>
        </div>

        <!-- Recent History -->
        <div v-if="recentEntries.length > 0" class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="px-6 py-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                Session History (Undo Available)
            </div>
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-slate-500">
                    <tr>
                        <th class="px-6 py-3">PO</th>
                        <th class="px-6 py-3">Product</th>
                        <th class="px-6 py-3">Size</th>
                        <th class="px-6 py-3">Qty</th>
                        <th class="px-6 py-3">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr v-for="(item, idx) in recentEntries" :key="item.id">
                        <td class="px-6 py-3 font-mono">{{ item.po }}</td>
                        <td class="px-6 py-3">{{ item.product }}</td>
                        <td class="px-6 py-3">{{ item.size }}</td>
                        <td class="px-6 py-3">{{ item.originalQty || item.original_qty || item.qty }}</td>
                        <td class="px-6 py-3">
                            <button @click="undoEntry(idx, item.id)" class="text-rose-500 hover:text-rose-700">
                                <i class="fa-solid fa-trash"></i> Undo
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
