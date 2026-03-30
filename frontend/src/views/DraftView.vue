<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useInventoryStore } from '../stores/inventory'

const store = useInventoryStore()
const date = ref(new Date().toISOString().split('T')[0])
const clientFilter = ref('')
const imageFile = ref(null)
const showDebug = ref(false)
const showBatchPrefix = ref(true)

const removeFromDraft = (index) => {
    store.removeFromDraft(index)
}

const printLabels = () => {
    window.print()
}

const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
        imageFile.value = file
    }
}

const confirmSent = async () => {
    if(store.draft.length === 0) return

    // Client-side Validation: Check Stock Limits
    for (const item of store.draft) {
        // Use loose equality (==) for ID matching to handle string/number differences
        const stockItem = store.inventory.find(inv => inv.id == item.stockId)
        if (!stockItem) continue // Should not happen
        
        const qty = item.qty || 1
        if (qty > stockItem.current_qty) {
            alert(`Error: Insufficient stock for PO ${item.po}.\n\nRequested: ${qty}\nAvailable: ${stockItem.current_qty}`)
            return // Stop submission
        }
    }

    try {
        let imagePath = null
        if (imageFile.value) {
            imagePath = await store.uploadImage(imageFile.value)
        }
        await store.confirmShipment(date.value, imagePath)
        alert('Shipments confirmed!')
        imageFile.value = null // reset
    } catch (e) {
        // Build a friendlier error message if it's from the server
        let msg = e.response?.data?.error || e.message
        alert('Error: ' + msg)
    }
}

onMounted(() => {
    store.fetchAll()
    window.addEventListener('keydown', handleGlobalSearch)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleGlobalSearch)
})

const clientFilterInput = ref(null)

const handleGlobalSearch = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        clientFilterInput.value?.focus()
    }
}


const handleCourierChange = (item) => {
    if (item.courier === 'Others') {
        item.isCustom = true
        item.courier = '' // Clear for input
    }
}

const saveCourier = async (item) => {
    if (!item.courier.trim()) {
        item.isCustom = false
        item.courier = 'SF' // Fallback or keep empty?
        return
    }
    
    try {
        await store.addCourier(item.courier.trim())
        item.isCustom = false
    } catch (e) {
        alert('Failed to save courier: ' + e.message)
    }
}

// Bulk Logic
const selected = ref([])
const isAllSelected = computed(() => {
    return store.draft.length > 0 && selected.value.length === store.draft.length
})

const toggleSelectAll = (checked) => {
    if (checked) {
        selected.value = store.draft.map((_, idx) => idx)
    } else {
        selected.value = []
    }
}

const batchRemove = () => {
    if (!confirm(`Remove ${selected.value.length} items from draft?`)) return
   
    // Sort indices descending to avoid shifting issues when splicing
    const indices = [...selected.value].sort((a, b) => b - a)
    for (const idx of indices) {
        store.removeFromDraft(idx)
    }
    selected.value = []
}

// Print Logic: Flatten the draft list based on 'qty'
const printableLabels = computed(() => {
    return store.draft.flatMap(item => {
        // Ensure at least 1 label, defaults to 1 if invalid
        const count = Math.max(1, parseInt(item.qty) || 1)
        return Array(count).fill(item)
    })
})
</script>

<template>
    <div class="space-y-6">
            <!-- (Header logic omitted for brevity, unchanged) -->

            <!-- Draft Header & Filter -->
            <div class="flex justify-between items-end">
                 <div class="flex items-center space-x-2">
                    <button 
                        v-if="selected.length > 0" 
                        @click="batchRemove" 
                        class="bg-rose-500 text-white px-3 py-1 rounded shadow-md text-xs font-bold hover:bg-rose-600 transition-colors animate-pulse"
                    >
                        <i class="fa-solid fa-trash mr-1"></i> Remove {{ selected.length }}
                    </button>
                 </div>
                 <div class="w-64">
                    <label class="block text-xs font-bold text-slate-400 mb-1">Filter by Client</label>
                    <input ref="clientFilterInput" type="text" v-model="clientFilter" placeholder="Client Name..." class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-teal-500 outline-none">
                 </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
                        <tr>
                            <th class="px-4 py-3 w-10">
                                <input type="checkbox" :checked="isAllSelected" @change="e => toggleSelectAll(e.target.checked)" class="rounded text-indigo-600 focus:ring-indigo-500">
                            </th>
                            <th class="px-4 py-3">Client</th>
                            <th class="px-4 py-3">PO Info</th>
                            <th class="px-4 py-3">Recipient</th>
                            <th class="px-4 py-3 w-16">Qty</th>
                            <th class="px-4 py-3">Courier</th>
                            <th class="px-4 py-3">Tracking No</th>
                            <th class="px-4 py-3">Note</th>
                            <th class="px-4 py-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-for="(dItem, idx) in store.draft.filter(i => !clientFilter || (i.client||'').toLowerCase().includes(clientFilter.toLowerCase()))" :key="idx">
                            <td class="px-4 py-3">
                                <input type="checkbox" v-model="selected" :value="idx" class="rounded text-indigo-600 focus:ring-indigo-500">
                            </td>
                            <td class="px-4 py-3">
                                <div class="font-bold text-slate-700">{{ dItem.client }}</div>
                            </td>
                            <td class="px-4 py-3">
                                <div class="font-bold">{{ dItem.po }}</div>
                                <div class="text-xs text-slate-500">{{ dItem.product }}</div>
                                <!-- Show available stock hint -->
                                <div class="text-[10px] text-teal-600 mt-1">
                                    Max: {{ store.inventory.find(i => i.id == dItem.stockId)?.current_qty ?? '?' }}
                                </div>
                                <!-- Production Scale Source Info (User Request) -->
                                <div class="text-[10px] mt-1 flex items-center gap-1" v-if="dItem.scale || dItem.source !== 'None'">
                                    <span class="font-semibold text-slate-600">Scale: {{ dItem.scale }}</span>
                                    <span class="text-[9px] px-1 rounded text-white" 
                                        :class="dItem.source === 'CLF' ? 'bg-green-500' : (dItem.source === 'Master' ? 'bg-blue-500' : 'bg-rose-400')">
                                        {{ dItem.source }}
                                    </span>
                                </div>
                            </td>
                            <td class="px-4 py-3">
                                <input v-model="dItem.recipient" placeholder="Recipient Name" class="w-full border-b border-dotted border-slate-300 focus:border-teal-500 outline-none py-1 bg-transparent">
                            </td>
                            <td class="px-4 py-3 w-16">
                                <input 
                                    type="number" 
                                    v-model.number="dItem.qty" 
                                    min="1" 
                                    :max="store.inventory.find(i => i.id == dItem.stockId)?.current_qty"
                                    class="w-full border-b border-dotted border-slate-300 focus:border-teal-500 outline-none py-1 bg-transparent font-mono text-center"
                                >
                            </td>
                            <td class="px-4 py-3">
                                <div v-if="dItem.isCustom">
                                    <input 
                                        v-model="dItem.courier" 
                                        @blur="saveCourier(dItem)"
                                        @keyup.enter="saveCourier(dItem)"
                                        placeholder="Enter Courier Name" 
                                        class="w-full border-b border-teal-500 bg-teal-50 px-2 py-1 outline-none"
                                        autoFocus
                                    >
                                </div>
                                <select v-else 
                                    v-model="dItem.courier" 
                                    @change="handleCourierChange(dItem)"
                                    class="w-full border-b border-dotted border-slate-300 focus:border-teal-500 outline-none py-1 bg-transparent"
                                >
                                    <option value="" disabled>Select...</option>
                                    <option v-for="c in store.couriers" :key="c.id" :value="c.name">{{ c.name }}</option>
                                    <option value="Others" class="font-bold text-teal-600">+ Add New...</option>
                                </select>
                            </td>
                            <td class="px-4 py-3">
                                <input v-model="dItem.tracking" placeholder="Tracking #" class="w-full border-b border-dotted border-slate-300 focus:border-teal-500 outline-none py-1 bg-transparent font-mono">
                            </td>
                            <td class="px-4 py-3">
                                <input v-model="dItem.note" placeholder="Note..." class="w-full border-b border-dotted border-slate-300 focus:border-teal-500 outline-none py-1 bg-transparent">
                            </td>
                            <td class="px-4 py-3 text-center">
                                <button @click="removeFromDraft(idx)" class="text-rose-400 hover:text-rose-600">
                                    <i class="fa-solid fa-times"></i>
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div v-if="store.draft.length === 0" class="p-8 text-center text-slate-400 bg-slate-50">
                    Draft is empty. Add items from "Stock List" tab.
                </div>
            </div>

            <div class="flex items-center justify-between pt-4" v-if="store.draft.length > 0">
                <div class="flex items-center space-x-2">
                    <label class="text-sm font-medium text-slate-600"><i class="fa-solid fa-paperclip mr-1"></i> Attach Proof (Image):</label>
                    <input type="file" @change="handleFileChange" accept="image/*" class="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer">
                </div>
                <div class="flex space-x-4">
                    <button @click="showBatchPrefix = !showBatchPrefix" class="text-slate-500 hover:text-teal-600 text-sm font-medium underline">
                        <i :class="showBatchPrefix ? 'fa-regular fa-square-check' : 'fa-regular fa-square'"></i> Batch Label
                    </button>
                    <button @click="showDebug = !showDebug" class="text-slate-500 hover:text-teal-600 text-sm font-medium underline">
                        <i class="fa-solid fa-eye mr-1"></i> {{ showDebug ? 'Hide Preview' : 'Show Label Preview' }}
                    </button>
                    <button @click="printLabels" class="bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-lg shadow-md font-medium">
                        <i class="fa-solid fa-print mr-2"></i> Print Labels
                    </button>
                    <button @click="confirmSent" class="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-lg shadow-md font-bold">
                        <i class="fa-solid fa-check mr-2"></i> Confirm Sent
                    </button>
                </div>
            </div>

            <!-- Hidden Print Area (Teleported to Body for clean printing) -->
            <Teleport to="body">
                <div id="print-area" :class="{ 'debug-visible': showDebug }">
                    <!-- Cut Lines (Overlay) -->
                    <div class="cut-line-vert"></div>
                    <div class="cut-line-horz-1"></div>
                    <div class="cut-line-horz-2"></div>

                    <div v-for="(item, i) in printableLabels" :key="i" class="print-label">
                        <!-- Label Content (Unchanged) -->
                        <div class="border-b border-black pb-0.5 mb-0.5">
                            <div class="text-sm font-bold flex flex-wrap items-baseline gap-1 leading-tight">
                                <span class="uppercase">{{ item.client }}</span>
                                <span>{{ item.po }}</span>
                            </div>
                            <!-- Client PO: Keep text-base for visibility, handle wrapping -->
                            <div class="text-base font-bold mt-0 leading-tight whitespace-pre-wrap break-words">PO# {{ item.clientPO || item.client_po }}</div>
                        </div>

                        <div class="flex-grow flex flex-col justify-start">
                            <div class="text-lg font-black leading-none mb-0.5">{{ item.itemNo }}</div>
                            <!-- Product: Reduced to text-sm to allow more space for Client PO -->
                            <div class="text-sm font-bold leading-tight line-clamp-2">{{ item.product }}</div>
                        </div>

                        <div class="border-t border-black pt-1 mt-auto">
                            <div class="text-base font-bold leading-tight whitespace-pre-line">
                                <span v-if="showBatchPrefix">批次号: </span>{{ item.batch }}
                            </div>
                            <div class="text-[10px] text-right mt-0.5 leading-none">
                                {{ date }}
                                <div v-if="item.scale" class="font-bold mt-0.5 pt-0.5 flex justify-end items-center gap-1">
                                    <span>{{ item.scale }} SF</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Teleport>
    </div>
</template>

<style scoped>
/* Cut Line Styles (Shared) */
.cut-line-vert {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    border-left: 1px dashed #ccc;
    z-index: 10;
    transform: translateX(-0.5px); /* Center perfectly */
}
.cut-line-horz-1 {
    position: absolute;
    top: 33.33%;
    left: 0;
    right: 0;
    border-top: 1px dashed #ccc;
    z-index: 10;
}
.cut-line-horz-2 {
    position: absolute;
    top: 66.66%;
    left: 0;
    right: 0;
    border-top: 1px dashed #ccc;
    z-index: 10;
}

/* Screen: Hide the print area */
@media screen {
    #print-area { display: none; }
    #print-area.debug-visible { 
        display: grid; 
        position: fixed; 
        top: 10%;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        border: 2px dashed #000; 
        background: #eee;
        box-shadow: 0 0 20px rgba(0,0,0,0.5);
        
        /* Mimic print layout EXACTLY */
        width: 108.9mm; /* Updated to user's 10.89cm */
        height: 152.4mm;
        
        grid-template-columns: repeat(2, 50%); /* EXACTLY 50% */
        grid-auto-rows: min-content; 
        gap: 0;
        padding: 0;
    }
    
    #print-area.debug-visible .print-label {
        /* Screen preview border (keep helpful for debugging layout, but subtle) */
        outline: 1px dotted #e5e7eb; 
        height: 50.8mm;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 2mm; /* Optimized Padding */
        background: white;
    }
}

/* Print: Format for 4" x 6" Label */
@media print {
    /* Globally hide everything except the print area */
    :global(body > *:not(#print-area)) {
        display: none !important;
    }

    /* Ensure print area is visible */
    #print-area {
        display: grid !important;
        visibility: visible !important;
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        
        grid-template-columns: repeat(2, 50%);
        grid-auto-rows: min-content; 
        gap: 0;
        box-sizing: border-box;
    }

    /* DEFINITIVE PAGE SIZE: 108.9mm Width x 152.4mm Height */
    @page {
        size: 108.9mm 152.4mm; 
        margin: 0; 
    }

    .print-label {
        /* Layout logic */
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        
        /* Height: To fit 3 rows (6 items) on 152mm paper */
        /* 152mm / 3 ~ 50mm */
        height: 50.8mm; /* 152.4 / 3 = 50.8 perfectly */
        overflow: hidden; 
        
        /* Spacing */
        padding: 3mm 5mm 3mm 8mm; /* top right bottom left - extra left for printer margin */ 
        margin: 0;
        
        /* Printing mechanics */
        break-inside: avoid;
        background: white;
        
        /* No Borders individually - handled by overlays */
        border: none;

        /* Font defaults */
        color: black;
        font-family: sans-serif;
     }
}
</style>
