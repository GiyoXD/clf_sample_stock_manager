<script setup>
import { ref, computed } from 'vue'
import axios from 'axios'

const props = defineProps({
    show: Boolean,
    target: String // 'inventory' or 'history'
})

const emit = defineEmits(['close', 'refresh'])

// Data
const step = ref(1)
const file = ref(null)
const previewRows = ref([])
const mapping = ref({})
const startRow = ref(2)
const isProcessing = ref(false)
const result = ref({ success: 0, errors: [] })

// Schema
const inventoryFields = [
    { key: 'date_in', label: 'Date In', required: true },
    { key: 'client', label: 'Client Name', required: false },
    { key: 'po', label: 'PO Number', required: true },
    { key: 'client_po', label: 'Client PO', required: false },
    { key: 'product', label: 'Product Name', required: true },
    { key: 'item_no', label: 'Item No.', required: false },
    { key: 'size', label: 'Size', required: false },
    { key: 'original_qty', label: 'Original Quantity', required: true },
    { key: 'current_qty', label: 'Current Quantity', required: false },
    { key: 'note', label: 'Note', required: false },
    { key: 'batch', label: 'Batch', required: false },
]

const historyFields = [
    { key: 'date_sent', label: 'Date Sent', required: true },
    { key: 'client', label: 'Client', required: false },
    { key: 'po', label: 'PO Number', required: true },
    { key: 'product', label: 'Product Name', required: true },
    { key: 'qty', label: 'Quantity', required: true },
    { key: 'recipient', label: 'Recipient', required: false },
    { key: 'courier', label: 'Courier', required: false },
    { key: 'tracking', label: 'Tracking', required: false },
]

const targetFields = computed(() => {
    return props.target === 'inventory' ? inventoryFields : historyFields
})

// Methods
const handleFileChange = (e) => {
    file.value = e.target.files[0]
}

const getPreview = async () => {
    if (!file.value) return alert('Please select a file')
    
    const formData = new FormData()
    formData.append('file', file.value)

    try {
        const res = await axios.post('http://localhost:3000/api/import/preview', formData)
        previewRows.value = res.data.rows
        step.value = 2
        
        // Auto-map based on headers (Row 1)
        if (previewRows.value.length > 0) {
            const headers = previewRows.value[0]
            targetFields.value.forEach(field => {
                const idx = headers.findIndex(h => h && h.toString().toLowerCase().includes(field.label.toLowerCase()))
                if (idx !== -1) {
                    mapping.value[field.key] = idx + 1 // 1-based index
                }
            })
        }
    } catch (e) {
        alert('Preview failed: ' + e.message)
    }
}

const executeImport = async () => {
    if (!confirm('Start import? This cannot be undone.')) return

    isProcessing.value = true
    const formData = new FormData()
    formData.append('file', file.value)
    formData.append('target', props.target)
    formData.append('mapping', JSON.stringify(mapping.value))
    formData.append('startRow', startRow.value)

    try {
        const res = await axios.post('http://localhost:3000/api/import/execute', formData)
        result.value = res.data
        step.value = 3
        emit('refresh')
    } catch (e) {
        alert('Import failed: ' + e.message)
    } finally {
        isProcessing.value = false
    }
}

const close = () => {
    step.value = 1
    file.value = null
    mapping.value = {}
    result.value = { success: 0, errors: [] }
    emit('close')
}

// Columns from preview for dropdown
const fileColumns = computed(() => {
    if (previewRows.value.length === 0) return []
    // Use first row as headers
    return previewRows.value[0].map((val, idx) => ({ 
        index: idx + 1, 
        label: `Column ${idx + 1}: ${val ? `"${val}"` : '(Empty)'}` 
    }))
})
</script>

<template>
    <div v-if="show" class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
        <div class="bg-white rounded-xl shadow-2xl w-[800px] max-h-[90vh] overflow-y-auto flex flex-col">
            <!-- Header -->
            <div class="bg-indigo-600 p-4 flex justify-between items-center text-white">
                <h3 class="text-lg font-bold">Import Data ({{ target === 'inventory' ? 'Stock' : 'History' }})</h3>
                <button @click="close" class="hover:text-rose-300"><i class="fa-solid fa-times"></i></button>
            </div>

            <!-- Body -->
            <div class="p-6 flex-1">
                
                <!-- Step 1: Upload -->
                <div v-if="step === 1" class="text-center py-10">
                    <div class="border-2 border-dashed border-slate-300 rounded-xl p-10 hover:border-indigo-500 transition-colors">
                        <i class="fa-solid fa-cloud-arrow-up text-5xl text-slate-300 mb-4"></i>
                        <p class="mb-4 text-slate-500">Select an Excel or CSV file to begin.</p>
                        <input type="file" @change="handleFileChange" accept=".xlsx, .csv" class="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 mx-auto max-w-xs"/>
                    </div>
                    <button @click="getPreview" class="mt-6 bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50" :disabled="!file">
                        Next: Map Columns <i class="fa-solid fa-arrow-right ml-2"></i>
                    </button>
                </div>

                <!-- Step 2: Mapping -->
                <div v-if="step === 2">
                    <div class="flex items-center mb-4 bg-yellow-50 p-3 rounded border border-yellow-200 text-sm text-yellow-800">
                        <i class="fa-solid fa-lightbulb mr-2 text-yellow-600"></i>
                        <span>Select the corresponding column from your file for each database field.</span>
                    </div>

                    <div class="grid grid-cols-2 gap-8">
                        <div>
                            <h4 class="font-bold text-slate-700 mb-2 border-b pb-2">Database Field</h4>
                            <div v-for="field in targetFields" :key="field.key" class="flex items-center justify-between mb-3 h-10">
                                <span class="text-sm font-medium" :class="{'text-rose-600': field.required}">
                                    {{ field.label }} {{ field.required ? '*' : '' }}
                                </span>
                            </div>
                        </div>
                        <div>
                            <h4 class="font-bold text-slate-700 mb-2 border-b pb-2">Your File Column</h4>
                            <div v-for="field in targetFields" :key="field.key" class="mb-3">
                                <select v-model="mapping[field.key]" class="w-full border border-slate-300 rounded px-2 h-10 text-sm focus:border-indigo-500 bg-white">
                                    <option :value="undefined">-- Ignore --</option>
                                    <option v-for="col in fileColumns" :key="col.index" :value="col.index">
                                        {{ col.label }}
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="mt-6 border-t pt-4 flex justify-between items-center">
                        <div class="flex items-center">
                             <label class="text-sm font-bold mr-2 text-slate-600">Start Import at Row:</label>
                             <input type="number" v-model.number="startRow" class="w-16 border rounded px-2 py-1 text-center font-bold">
                        </div>
                        <button @click="executeImport" class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center" :disabled="isProcessing">
                            <span v-if="isProcessing" class="animate-spin mr-2"><i class="fa-solid fa-circle-notch"></i></span>
                            {{ isProcessing ? 'Importing...' : 'Start Import' }}
                        </button>
                    </div>

                    <!-- Mini Preview -->
                    <div class="mt-6">
                        <h5 class="text-xs font-bold text-slate-400 uppercase mb-2">File Preview (First 5 Rows)</h5>
                        <div class="overflow-x-auto border rounded bg-slate-50">
                            <table class="table-auto text-xs w-full text-slate-600">
                                <thead>
                                    <tr>
                                        <th v-for="(col, i) in previewRows[0]" :key="i" class="px-2 py-1 border-b text-left bg-slate-100">
                                            {{ i+1 }}: {{ col }}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(row, idx) in previewRows.slice(1)" :key="idx">
                                        <td v-for="(cell, i) in row" :key="i" class="px-2 py-1 border-b">{{ cell }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Step 3: Result -->
                <div v-if="step === 3" class="text-center py-10">
                    <div v-if="result.success > 0" class="text-emerald-500 text-6xl mb-4"><i class="fa-solid fa-circle-check"></i></div>
                    <div v-else class="text-rose-500 text-6xl mb-4"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    
                    <h3 class="text-2xl font-bold text-slate-700 mb-2">Import Complete</h3>
                    <p class="text-lg text-slate-600">Successfully imported <span class="font-bold text-indigo-600">{{ result.success }}</span> records.</p>
                    
                    <div v-if="result.errors && result.errors.length > 0" class="mt-6 bg-rose-50 p-4 rounded-lg text-left max-w-lg mx-auto">
                        <h4 class="font-bold text-rose-700 mb-2">Errors ({{ result.errors.length }})</h4>
                        <ul class="list-disc pl-5 text-sm text-rose-600 max-h-40 overflow-y-auto">
                            <li v-for="(err, i) in result.errors" :key="i">{{ err }}</li>
                        </ul>
                    </div>

                    <button @click="close" class="mt-8 bg-slate-200 text-slate-700 px-6 py-2 rounded-lg font-bold hover:bg-slate-300">
                        Close
                    </button>
                </div>

            </div>
        </div>
    </div>
</template>
