<script setup>
import { ref, onMounted } from 'vue'
import { useInventoryStore } from '../stores/inventory'

const store = useInventoryStore()
const date = ref(new Date().toISOString().split('T')[0])
const clientFilter = ref('')
const imageFile = ref(null)

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
})

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
</script>

<template>
    <div class="space-y-6">
            <!-- (Header logic omitted for brevity, unchanged) -->

            <!-- Draft Header & Filter -->
            <div class="flex justify-between items-end">
                 <div><!-- Placeholder for potential title if needed, or keep clean --></div>
                 <div class="w-64">
                    <label class="block text-xs font-bold text-slate-400 mb-1">Filter by Client</label>
                    <input type="text" v-model="clientFilter" placeholder="Client Name..." class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-teal-500 outline-none">
                 </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
                        <tr>
                            <th class="px-4 py-3">Client</th>
                            <th class="px-4 py-3">PO Info</th>
                            <th class="px-4 py-3">Recipient</th>
                            <th class="px-4 py-3 w-16">Qty</th>
                            <th class="px-4 py-3">Courier</th>
                            <th class="px-4 py-3">Tracking No</th>
                            <th class="px-4 py-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-for="(dItem, idx) in store.draft.filter(i => !clientFilter || (i.client||'').toLowerCase().includes(clientFilter.toLowerCase()))" :key="idx">
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
                    <button @click="printLabels" class="bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-lg shadow-md font-medium">
                        <i class="fa-solid fa-print mr-2"></i> Print Labels
                    </button>
                    <button @click="confirmSent" class="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-lg shadow-md font-bold">
                        <i class="fa-solid fa-check mr-2"></i> Confirm Sent
                    </button>
                </div>
            </div>

            <!-- Hidden Print Area -->
            <div id="print-area">
                <!-- 100mm x 70mm -->
                <div v-for="(item, i) in store.draft" :key="i" class="print-label border-2 border-black p-4 mb-4 font-sans text-xs flex flex-col justify-between" style="width: 100mm; height: 70mm; margin: 0 auto; box-sizing: border-box;">
                    <div>
                        <div class="font-bold text-sm mb-1">{{ item.client }}</div> 
                        <div class="text-[10px] text-gray-600">PO: {{ item.po }}</div>
                        <hr class="border-black my-1">
                        <div class="font-bold text-lg leading-tight mb-1">{{ item.itemNo }}</div>
                        <div class="text-s leading-tight">{{ item.product }}</div>
                    </div>
                    <div class="text-[10px] mt-2">
                        <div class="flex justify-between">
                            <span>Date: {{ date }}</span>
                            <span>Qty: {{ item.qty || 1 }}</span>
                        </div>
                        <div>Batch: {{ item.batch }}</div>
                        <div class="mt-2 text-[8px] italic text-right"> Sample Manager </div>
                    </div>
                </div>
            </div>
    </div>
</template>

<style scoped>
@media print {
    #print-area { display: block; }
}
@media screen {
    #print-area { display: none; }
}
</style>
