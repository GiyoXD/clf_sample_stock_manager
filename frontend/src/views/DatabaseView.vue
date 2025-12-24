<script setup>
import { ref, onMounted } from 'vue'
import { useInventoryStore } from '../stores/inventory'
import { useDebugStore } from '../stores/debug'
import * as XLSX from 'xlsx' // Standard import
import axios from 'axios'

const store = useInventoryStore()
const debugStore = useDebugStore()
const notification = ref({ show: false, message: '', type: 'success' })

onMounted(async () => {
    debugStore.addLog('DatabaseView mounted, fetching all data...')
    try {
        await store.fetchAll()
        debugStore.addLog('DatabaseView: Data fetched successfully', 'success')
    } catch (err) {
        debugStore.addLog(`DatabaseView Error: ${err.message}`, 'error', err)
        showNotification('Failed to load data', 'error')
    }
})

const showNotification = (msg, type = 'success') => {
    notification.value = { show: true, message: msg, type }
    setTimeout(() => notification.value.show = false, 3000)
}

const showMappingModal = ref(false)
const pendingFile = ref(null)
const excelHeaders = ref([])
const jsonData = ref([])
const mapping = ref({
    yxdh: '', // PO (System ID)
    client_po: '', // Client PO
    khjc: '', // Client
    scmc: '', // Product
    cpmc: '', // Item No
    zlyq: ''  // Note
})

const handleFileImport = (event, type) => {
    const file = event.target.files[0]
    if (!file) return

    // For CLF, do direct import (Legacy/Simple)
    if (type === 'clf') {
        const reader = new FileReader()
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result)
                const wb = XLSX.read(data, { type: 'array' })
                const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
                await store.syncClfData(json)
                showNotification(`CLF Data Imported: ${json.length} records`)
            } catch (err) {
                const msg = err.response?.data?.error || err.message
                showNotification('Error: ' + msg, 'error')
            }
        }
        reader.readAsArrayBuffer(file)
        return
    }

    // For Master Data -> FIXED INDEX STRUCT (Zero-based Array)
    // 0: big_po (unused)
    // 1: using_po (yxdh)
    // 5: client (khjc)
    // 6: client_po (client_po)
    // 10: product_name (scmc)
    // 24: quality_note (zlyq)
    // 27: product_code (cpmc)
    
    const reader = new FileReader()
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result)
            const wb = XLSX.read(data, { type: 'array' })
            // Use header: 1 to get Array of Arrays
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
            
            if (rows.length === 0) {
                return showNotification('File is empty', 'error')
            }

            // Extract Data
            // Skip Header (Row 0) if it looks like a header (contains "using_po" etc), otherwise process
            // User provided strict indices, we assume standard template.
            const cleanData = []
            
            // Start from row 1 (index 1) to skip header, or row 0 if no header?
            // Usually Row 1 is header. Let's try to detect header at 0.
            let startIndex = 0;
            if (String(rows[0][1]).includes('using_po') || String(rows[0][1]).includes('的任务单号')) {
                startIndex = 1; 
            }

            for (let i = startIndex; i < rows.length; i++) {
                const r = rows[i];
                // Safety check for empty rows
                if (!r || r.length < 2) continue;

                // STRICT MAPPING (Refactored v2.1)
                const using_po = r[1];
                if (!using_po) continue; // Skip empty POs

                cleanData.push({
                    using_po: String(r[1] || '').trim(),
                    client: String(r[5] || '').trim(),
                    client_po: String(r[6] || '').trim(),
                    product_name: String(r[10] || '').trim(),
                    quality_note: String(r[24] || '').trim(),
                    product_code: String(r[27] || '').trim(),
                });
            }

            if (cleanData.length === 0) {
               return showNotification('No valid data found (Check Columns: 2=PO, 6=Client, etc.)', 'error')
            }

            if (!confirm(`Found ${cleanData.length} records using Standard Format. Import now?`)) return;

            // Send to Backend
            jsonData.value = cleanData
            await confirmImportDirect()

        } catch (err) {
             console.error(err)
             showNotification('Parse Error: ' + err.message, 'error')
        }
        // Reset input
        event.target.value = ''
    }
    reader.readAsArrayBuffer(file)
}

// Direct Import (Bypasses Mapping Modal)
const confirmImportDirect = async () => {
    const CHUNK_SIZE = 2000;
    const totalRows = jsonData.value.length;
    const chunks = Math.ceil(totalRows / CHUNK_SIZE);
    
    try {
        for (let i = 0; i < chunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = start + CHUNK_SIZE;
            const chunk = jsonData.value.slice(start, end);
            
            showNotification(`Importing chunk ${i + 1} of ${chunks}...`, 'info');
            // clear=true for first chunk
            await store.syncMasterData(chunk, {}, i === 0);
        }
        await store.fetchAll();
        showNotification(`Success! ${totalRows} records imported.`, 'success')
    } catch (err) {
        console.error(err)
        const msg = err.response?.data?.error || err.message
        showNotification('Import failed: ' + msg, 'error')
    }
}

const closeMappingModal = () => {
    showMappingModal.value = false
    jsonData.value = []
    excelHeaders.value = []
}

const confirmImport = async () => {
    if (!mapping.value.yxdh) {
        return showNotification('Please map the PO (System ID) field!', 'error')
    }
    
    // Chunking Logic
    const CHUNK_SIZE = 2000;
    const totalRows = jsonData.value.length;
    const chunks = Math.ceil(totalRows / CHUNK_SIZE);
    
    try {
        for (let i = 0; i < chunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = start + CHUNK_SIZE;
            const chunk = jsonData.value.slice(start, end);
            
            showNotification(`Importing chunk ${i + 1} of ${chunks}...`, 'info');
            
            // First chunk clears the DB (clear=true), subsequent chunks append (clear=false)
            await store.syncMasterData(chunk, mapping.value, i === 0);
        }

        // Final fetch to update UI
        await store.fetchAll();

        showNotification(`Success! ${totalRows} records imported.`, 'success')
        closeMappingModal()
    } catch (err) {
        console.error(err)
        const msg = err.response?.data?.error || err.message
        showNotification('Import failed: ' + msg, 'error')
    }
}

const exportInventory = () => {
    const ws = XLSX.utils.json_to_sheet(store.inventory)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Inventory")
    XLSX.writeFile(wb, "Inventory_Export.xlsx")
}

const exportHistory = () => {
    const ws = XLSX.utils.json_to_sheet(store.shipments)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "History")
    XLSX.writeFile(wb, "History_Export.xlsx")
}

const cleanImages = async () => {
    if (!confirm('This will permanently delete uploaded images that are not attached to any shipment record. Continue?')) return;
    try {
        debugStore.addLog('Starting image cleanup...');
        const res = await axios.delete('/api/cleanup-images');
        debugStore.addLog(`Cleanup result: ${JSON.stringify(res.data)}`, 'success');
        if (res.data.deleted > 0) {
            alert(`Cleanup complete! Deleted ${res.data.deleted} unused images.`);
        } else {
            alert('Cleanup complete! No unused images found.');
        }
    } catch (err) {
        debugStore.addLog(`Cleanup failed: ${err.message}`, 'error', err);
        alert('Cleanup failed: ' + err.message);
    }
}

const showResetModal = ref(false)
const resetConfirmText = ref('')

const resetDatabase = async () => {
    if (resetConfirmText.value !== 'RESET') {
        alert('Please type "RESET" to confirm.')
        return
    }
    
    try {
        await axios.post('/api/debug/reset-db')
        alert('Database has been reset successfully. All data is gone.')
        showResetModal.value = false
        resetConfirmText.value = ''
        // Refresh
        await store.fetchAll()
    } catch (e) {
        alert('Reset failed: ' + e.message)
    }
}

const triggerBackup = async () => {
    try {
        const res = await axios.post('/api/backup')
        alert(`Success! ${res.data.message}`)
    } catch (e) {
        alert('Backup failed: ' + e.message)
    }
}

const restoreInput = ref(null)

const triggerRestore = () => {
    restoreInput.value.click()
}

const handleRestore = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    
    // Safety Check
    if (!confirm('WARNING: This will replace your ENTIRE database with the selected backup.\n\nAll current data will be LOST.\n\nAre you sure you want to continue?')) {
        event.target.value = ''
        return
    }

    const formData = new FormData()
    formData.append('file', file)

    try {
        const res = await axios.post('/api/restore', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
        alert('Restore Successful! The application will now reload.')
        window.location.reload()
    } catch (err) {
        console.error(err)
        alert('Restore Failed: ' + (err.response?.data?.error || err.message))
    }
    event.target.value = ''
}
</script>

<template>
<div>
    <div class="max-w-4xl mx-auto space-y-8">
        <!-- Notification -->
        <transition name="fade">
            <div v-if="notification.show" :class="['fixed top-20 right-4 px-6 py-4 rounded-lg shadow-xl text-white z-50 flex items-center', notification.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500']">
                <i :class="['mr-3 fa-solid', notification.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle']"></i>
                {{ notification.message }}
            </div>
        </transition>

        <!-- Import Section -->
        <div class="bg-white p-8 rounded-xl shadow-lg border-t-4 border-teal-500">
            <h2 class="text-2xl font-bold text-slate-800 mb-6">Data Import</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <label class="block font-semibold text-slate-700 mb-2">1. Master Data (CSV/XLSX)</label>
                    <p class="text-xs text-slate-500 mb-3">Req: yxdh (编号), khjc (客户), scmc (产品名称), cpmc (产品编号), zlyq (质量要求)</p>
                    <input type="file" accept=".xlsx, .xls, .csv" @change="e => handleFileImport(e, 'master')" class="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"/>
                    <div class="mt-2 text-xs font-mono text-slate-400">Current Records: {{ store.masterDataCount }}</div>
                </div>

                <div>
                    <label class="block font-semibold text-slate-700 mb-2">2. CLF Data (CSV/XLSX)</label>
                    <p class="text-xs text-slate-500 mb-3">Req: TTX单号 (PO), 批次 (Batch), PO (ClientPO)</p>
                    <input type="file" accept=".xlsx, .xls, .csv" @change="e => handleFileImport(e, 'clf')" class="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                    <div class="mt-2 text-xs font-mono text-slate-400">Current Records: {{ store.clfDataCount }}</div>
                </div>
            </div>
        </div>

        <!-- Export Section -->
        <div class="bg-white p-8 rounded-xl shadow-lg border-t-4 border-slate-500">
            <h2 class="text-2xl font-bold text-slate-800 mb-6">Data Export</h2>
            <div class="flex space-x-4">
                <button @click="exportInventory" class="flex-1 bg-white border-2 border-slate-200 hover:border-teal-500 hover:text-teal-600 text-slate-600 font-bold py-4 rounded-xl transition-all flex flex-col items-center justify-center">
                    <i class="fa-solid fa-file-excel text-3xl mb-2 text-emerald-600"></i>
                    <span>Export Stock In</span>
                </button>
                <button @click="exportHistory" class="flex-1 bg-white border-2 border-slate-200 hover:border-slate-800 hover:text-slate-800 text-slate-600 font-bold py-4 rounded-xl transition-all flex flex-col items-center justify-center">
                    <i class="fa-solid fa-clock-rotate-left text-3xl mb-2 text-indigo-600"></i>
                    <span>Export History</span>
                </button>
            </div>
        </div>

        <!-- Maintenance Zone -->
        <div class="bg-white p-8 rounded-xl shadow-lg border-t-4 border-indigo-500">
            <h2 class="text-2xl font-bold text-slate-800 mb-6 flex items-center">
                <i class="fa-solid fa-screwdriver-wrench text-indigo-500 mr-3"></i> 
                Maintenance
            </h2>
            <div class="flex space-x-4">
                <button @click="triggerBackup" class="flex-1 bg-white border-2 border-slate-200 hover:border-indigo-500 hover:text-indigo-600 text-slate-600 font-bold py-4 rounded-xl transition-all flex flex-col items-center justify-center">
                    <i class="fa-solid fa-download text-3xl mb-2 text-indigo-500"></i>
                    <span>Backup Database Now</span>
                </button>
                <button @click="triggerRestore" class="flex-1 bg-white border-2 border-slate-200 hover:border-teal-500 hover:text-teal-600 text-slate-600 font-bold py-4 rounded-xl transition-all flex flex-col items-center justify-center">
                    <i class="fa-solid fa-upload text-3xl mb-2 text-teal-500"></i>
                    <span>Restore Backup</span>
                </button>
                <!-- Hidden Restore Input -->
                <input ref="restoreInput" type="file" accept=".sqlite" class="hidden" @change="handleRestore">
            </div>
        </div>

        <!-- Danger Zone -->
        <div class="bg-white p-8 rounded-xl shadow-lg border-t-4 border-rose-500">
            <h2 class="text-2xl font-bold text-slate-800 mb-6 flex items-center">
                <i class="fa-solid fa-triangle-exclamation text-rose-500 mr-3"></i> 
                Danger Zone
            </h2>
            <div class="flex space-x-4">
                <button @click="cleanImages" class="flex-1 bg-white border-2 border-slate-200 hover:border-orange-500 hover:text-orange-600 text-slate-600 font-bold py-4 rounded-xl transition-all flex flex-col items-center justify-center">
                    <i class="fa-solid fa-broom text-3xl mb-2 text-orange-500"></i>
                    <span>Clean Unused Images</span>
                </button>
                <button @click="showResetModal = true" class="flex-1 bg-white border-2 border-slate-200 hover:border-rose-500 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold py-4 rounded-xl transition-all flex flex-col items-center justify-center">
                    <i class="fa-solid fa-bomb text-3xl mb-2 text-rose-500"></i>
                    <span>Reset Database</span>
                </button>
            </div>
        </div>

        <!-- Master Data Visualization -->
        <div class="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <div class="p-6 bg-slate-50 border-b border-slate-200">
                <h2 class="text-xl font-bold text-slate-800">Master List Preview</h2>
                <p class="text-xs text-slate-500">Showing first 100 records</p>
            </div>
            <div class="overflow-x-auto max-h-[500px]">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-100 text-slate-500 uppercase tracking-wider sticky top-0">
                        <tr>
                            <th class="px-6 py-3">PO (using_po)</th>
                            <th class="px-6 py-3">Client PO</th>
                            <th class="px-6 py-3">Client</th>
                            <th class="px-6 py-3">Product</th>
                            <th class="px-6 py-3">Item No</th>
                            <th class="px-6 py-3">Note</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        <tr v-for="item in store.masterData.slice(0, 100)" :key="item.id" class="hover:bg-slate-50">
                            <td class="px-6 py-3 font-medium text-teal-600">{{ item.using_po }}</td>
                            <td class="px-6 py-3 text-slate-600">{{ item.client_po }}</td>
                            <td class="px-6 py-3 text-slate-600">{{ item.client }}</td>
                            <td class="px-6 py-3 text-slate-600">{{ item.product_name }}</td>
                            <td class="px-6 py-3 font-mono text-slate-500">{{ item.product_code }}</td>
                            <td class="px-6 py-3 text-xs text-slate-400 italic">{{ item.quality_note }}</td>
                        </tr>
                        <tr v-if="store.masterData.length === 0">
                            <td colspan="6" class="px-6 py-8 text-center text-slate-400">
                                No master data loaded. Import a file to see records here.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Column Mapping Modal: Wrapper Restored Below -->
    
    <!-- Reset Confirmation Modal -->
    <div v-if="showResetModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-[fade-in_0.2s_ease-out] border-t-8 border-rose-600">
            <div class="p-8 text-center">
                <i class="fa-solid fa-triangle-exclamation text-6xl text-rose-500 mb-4 block"></i>
                <h3 class="text-2xl font-bold text-slate-800 mb-2">Reset Database?</h3>
                <p class="text-slate-600 mb-6">This action cannot be undone. All <b>Inventory</b>, <b>Shipments</b>, and <b>Couriers</b> will be permanently deleted.</p>
                
                <div class="text-left mb-6">
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Type "RESET" to confirm</label>
                    <input v-model="resetConfirmText" class="w-full border-2 border-slate-300 rounded-lg p-3 text-lg font-mono text-center focus:border-rose-500 outline-none uppercase" placeholder="RESET">
                </div>

                <div class="flex space-x-3">
                    <button @click="showResetModal = false; resetConfirmText = ''" class="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                    <button 
                        @click="resetDatabase" 
                        :disabled="resetConfirmText !== 'RESET'"
                        class="flex-1 py-3 bg-rose-600 text-white font-bold rounded-lg shadow-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        <i class="fa-solid fa-trash-can mr-2"></i> Wipe Data
                    </button>
                </div>
            </div>
        </div>
    </div>
    <!-- Column Mapping Modal -->
    <div v-if="showMappingModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-[fade-in_0.2s_ease-out]">
            <div class="bg-teal-600 px-6 py-4 flex justify-between items-center">
                <h3 class="text-xl font-bold text-white"><i class="fa-solid fa-list-check mr-2"></i> Map Columns</h3>
                <button @click="closeMappingModal" class="text-white hover:text-teal-200 transition-colors">
                    <i class="fa-solid fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="p-6 space-y-6">
                <!-- Content -->
                <p class="text-slate-600 text-sm">Please select which column from your Excel file corresponds to each System Field.</p>

                <div class="grid grid-cols-1 gap-4">
                    <!-- PO (System ID) -->
                    <div class="flex items-center justify-between border-b pb-2">
                        <div class="w-1/3">
                            <label class="font-bold text-slate-700 block">PO (System ID)</label>
                            <span class="text-xs text-slate-400">Unique Identifier (e.g. 编号)</span>
                        </div>
                        <i class="fa-solid fa-arrow-right text-slate-300"></i>
                        <select v-model="mapping.yxdh" class="w-1/2 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white">
                            <option value="">-- Don't Import --</option>
                            <option v-for="header in excelHeaders" :key="header" :value="header">{{ header }}</option>
                        </select>
                    </div>

                    <!-- Client PO -->
                    <div class="flex items-center justify-between border-b pb-2">
                        <div class="w-1/3">
                            <label class="font-bold text-slate-700 block">Client PO</label>
                            <span class="text-xs text-slate-400">Using: {{ mapping.client_po || 'Default' }}</span>
                        </div>
                        <i class="fa-solid fa-arrow-right text-slate-300"></i>
                        <select v-model="mapping.client_po" class="w-1/2 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white">
                            <option value="">-- Don't Import --</option>
                            <option v-for="header in excelHeaders" :key="header" :value="header">{{ header }}</option>
                        </select>
                    </div>

                    <!-- Client -->
                    <div class="flex items-center justify-between border-b pb-2">
                        <div class="w-1/3">
                            <label class="font-bold text-slate-700 block">Client Name</label>
                        </div>
                        <i class="fa-solid fa-arrow-right text-slate-300"></i>
                        <select v-model="mapping.khjc" class="w-1/2 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white">
                            <option value="">-- Don't Import --</option>
                            <option v-for="header in excelHeaders" :key="header" :value="header">{{ header }}</option>
                        </select>
                    </div>

                    <!-- Product -->
                    <div class="flex items-center justify-between border-b pb-2">
                        <div class="w-1/3">
                            <label class="font-bold text-slate-700 block">Product Name</label>
                        </div>
                        <i class="fa-solid fa-arrow-right text-slate-300"></i>
                        <select v-model="mapping.scmc" class="w-1/2 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white">
                            <option value="">-- Don't Import --</option>
                            <option v-for="header in excelHeaders" :key="header" :value="header">{{ header }}</option>
                        </select>
                    </div>

                    <!-- Item No -->
                    <div class="flex items-center justify-between border-b pb-2">
                        <div class="w-1/3">
                            <label class="font-bold text-slate-700 block">Item No / Code</label>
                        </div>
                        <i class="fa-solid fa-arrow-right text-slate-300"></i>
                        <select v-model="mapping.cpmc" class="w-1/2 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white">
                            <option value="">-- Don't Import --</option>
                            <option v-for="header in excelHeaders" :key="header" :value="header">{{ header }}</option>
                        </select>
                    </div>

                    <!-- Note -->
                    <div class="flex items-center justify-between border-b pb-2">
                        <div class="w-1/3">
                            <label class="font-bold text-slate-700 block">Note / Quality</label>
                        </div>
                        <i class="fa-solid fa-arrow-right text-slate-300"></i>
                        <select v-model="mapping.zlyq" class="w-1/2 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white">
                            <option value="">-- Don't Import --</option>
                            <option v-for="header in excelHeaders" :key="header" :value="header">{{ header }}</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="bg-slate-50 px-6 py-4 flex justify-end space-x-3">
                <button @click="closeMappingModal" class="px-4 py-2 text-slate-600 font-bold hover:text-slate-800 transition-colors">Cancel</button>
                <button @click="confirmImport" class="px-6 py-2 bg-teal-600 text-white font-bold rounded-lg shadow-md hover:bg-teal-700 hover:shadow-lg transition-all transform active:scale-95">
                    Confirm Import
                </button>
            </div>
        </div>
    </div>
</div>
</template>

