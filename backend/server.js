const express = require('express');
const cors = require('cors');
const db = require('./db');
const app = express();
const PORT = 3000;
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Unique filename: date + original name
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json({ limit: '500mb', strict: false }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use('/uploads', express.static('uploads'));

// --- INVENTORY ROUTES ---

// --- INVENTORY ROUTES ---

// Get All Inventory (Active)
app.get('/api/inventory', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM inventory WHERE deleted_at IS NULL ORDER BY created_at DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Trash (Inventory)
app.get('/api/inventory/trash', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM inventory WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Stock In
app.post('/api/inventory', (req, res) => {
    try {
        const { po, client, clientPO, product, itemNo, batch, note, date, size, qty } = req.body;
        const stmt = db.prepare(`
            INSERT INTO inventory (po, client, client_po, product, item_no, batch, note, date_in, size, original_qty, current_qty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(po, client, clientPO, product, itemNo, batch, note, date, size, qty, qty);
        res.json({ id: info.lastInsertRowid, ...req.body });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Inventory (Edit)
app.put('/api/inventory/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { originalQty, note, po, product, itemNo } = req.body;
        const row = db.prepare('SELECT original_qty, current_qty FROM inventory WHERE id = ?').get(id);
        if (!row) return res.status(404).json({ error: 'Item not found' });

        const diff = originalQty - row.original_qty;
        const newCurrent = row.current_qty + diff;

        const stmt = db.prepare(`
            UPDATE inventory 
            SET original_qty = ?, current_qty = ?, note = ?, po = ?, product = ?, item_no = ?
            WHERE id = ?
        `);
        // If PO is empty, use empty string to satisfy NOT NULL
        stmt.run(originalQty, newCurrent, note, po || "", product, itemNo, id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// Soft Delete (Recycle Bin)
app.delete('/api/inventory/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare("UPDATE inventory SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), id);
        res.json({ success: true });
    } catch (err) {
        const errorLog = `[${new Date().toISOString()}] Delete Error: ${err.message}\nStack: ${err.stack}\n\n`;
        fs.appendFileSync(path.join(__dirname, 'error.log'), errorLog);
        res.status(500).json({ error: err.message });
    }
});

// Restore Inventory
app.post('/api/inventory/restore/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('UPDATE inventory SET deleted_at = NULL WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Hard Delete Inventory
// Hard Delete Inventory (and unlink shipments)
app.delete('/api/inventory/trash/:id', (req, res) => {
    try {
        const { id } = req.params;
        const transaction = db.transaction(() => {
            // Unlink shipments first (set stock_id to NULL) so we don't break FK
            // Or should we delete them? User said "Delete Forever". 
            // If we unlink, the shipment history remains but points to nothing.
            // Let's unlink to be safe, preserving history record (though "Ghost" data).
            db.prepare('UPDATE shipments SET stock_id = NULL WHERE stock_id = ?').run(id);
            db.prepare('DELETE FROM inventory WHERE id = ?').run(id);
        });
        transaction();
        res.json({ success: true });
    } catch (err) {
        const errorLog = `[${new Date().toISOString()}] Hard Delete Inventory Error: ${err.message}\nStack: ${err.stack}\n\n`;
        fs.appendFileSync(path.join(__dirname, 'error.log'), errorLog);
        res.status(500).json({ error: err.message });
    }
});

// --- SHIPMENT ROUTES ---

// Get All Shipments (Active)
app.get('/api/shipments', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM shipments WHERE deleted_at IS NULL ORDER BY date_sent DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Trash (Shipments)
app.get('/api/shipments/trash', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM shipments WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Shipment (Confirm Sent)
// Create Shipment (Confirm Sent)
app.post('/api/shipments', (req, res) => {
    const { items, dateSent, imagePath } = req.body; // items has .qty now

    const insertShipment = db.prepare(`
        INSERT INTO shipments (stock_id, po, client, product, recipient, courier, tracking, date_sent, image_path, qty, size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Use >= qty, and deduct qty
    const updateStock = db.prepare(`
        UPDATE inventory SET current_qty = current_qty - ? WHERE id = ? AND current_qty >= ?
    `);

    const transaction = db.transaction((draftItems) => {
        for (const item of draftItems) {
            const qty = item.qty || 1;
            const info = updateStock.run(qty, item.stockId, qty);

            // Should we error if stock is insufficient? 
            // For now, let's allow it but check info.changes. 
            // If strictly needed, we throw error. 
            // User requested "calculation", assuming valid stock.
            // If info.changes === 0, it means not enough stock.
            if (info.changes === 0) {
                throw new Error(`Insufficient stock for P.O: ${item.po}`);
            }

            insertShipment.run(
                item.stockId,
                item.po,
                item.client,
                item.product,
                item.recipient,
                item.courier,
                item.tracking || null,
                dateSent,
                imagePath || null,
                qty,
                item.size || ''
            );
        }
    });

    try {
        transaction(items);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Hard Delete Shipment (Undo/Revert)
app.delete('/api/shipments/:id', (req, res) => {
    try {
        const { id } = req.params;
        const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
        if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

        // Restore Stock (use shipment.qty)
        const qty = shipment.qty || 1;
        db.prepare('UPDATE inventory SET current_qty = current_qty + ? WHERE id = ?').run(qty, shipment.stock_id);

        // Hard Delete (Undo) - User request: don't put in trash
        db.prepare("DELETE FROM shipments WHERE id = ?").run(id);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Soft Delete Shipment (Move to Trash)
app.post('/api/shipments/trash/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare("UPDATE shipments SET deleted_at = DATETIME('now') WHERE id = ?").run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Trash Shipments
app.get('/api/shipments/trash', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM shipments WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Restore Shipment (From Recycle Bin)
app.post('/api/shipments/restore/:id', (req, res) => {
    try {
        const { id } = req.params;
        const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
        if (!shipment) return res.status(404).json({ error: 'Not found' });

        // Deduct Stock again (use shipment.qty)
        // Check if sufficient stock? Maybe assume yes if they restore.
        const qty = shipment.qty || 1;
        db.prepare('UPDATE inventory SET current_qty = current_qty - ? WHERE id = ?').run(qty, shipment.stock_id);

        db.prepare('UPDATE shipments SET deleted_at = NULL WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Hard Delete Shipment
app.delete('/api/shipments/trash/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM shipments WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DATA ROUTES ---

// Get Master Data (All)
app.get('/api/master-data', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM master_data').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Sync Master Data (Index-Based Support or Mapping)
app.post('/api/master-data/sync', (req, res) => {
    // Expecting { data: [rows], mapping: {...}, clear: boolean }
    const { data, clear: shouldClear } = req.body;

    if (!Array.isArray(data)) {
        return res.status(400).json({ error: 'Data must be an array' });
    }

    // Prepare insert for new schem
    const insert = db.prepare('INSERT INTO master_data (using_po, client, client_po, product_name, product_code, quality_note) VALUES (?, ?, ?, ?, ?, ?)');
    const deleteParams = db.prepare('DELETE FROM master_data');

    const transaction = db.transaction((rows) => {
        // Only clear if explicitly requested (or if it's the first chunk)
        if (shouldClear === true) {
            deleteParams.run();
            console.log('Clearing master_data table (Clear flag check passed)');
        }

        let failedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            // Expected Keys from Frontend: yxdh (mapped to using_po), khjc (client), etc.
            // Wait, frontend is sending { yxdh: ..., khjc: ... } from the fixed index parser?
            // Let's update frontend to send new keys too, OR map here.
            // BETTER: Update frontend to send proper English keys.
            // Assuming frontend sends: using_po, client, client_po, product_name, product_code, quality_note

            const using_po = row.using_po;

            // Strict Validation: Must have System PO
            if (!using_po) {
                skippedCount++;
                continue;
            }

            try {
                insert.run(
                    String(using_po).trim(),
                    String(row.client || '').trim(),
                    String(row.client_po || '').trim(),
                    String(row.product_name || '').trim(),
                    String(row.product_code || '').trim(),
                    String(row.quality_note || '').trim()
                );
            } catch (rowErr) {
                failedCount++;
                console.error(`Row ${i} import failed:`, row, rowErr.message);
            }
        }

        if (failedCount > 0) {
            console.warn(`Import warning: ${failedCount} rows failed, ${skippedCount} rows skipped.`);
        }

        const validRows = rows.length - failedCount - skippedCount;
        if (validRows === 0 && rows.length > 0) {
            console.error(`Batch Failure: ${rows.length} rows processed. ${skippedCount} skipped (no PO), ${failedCount} failed.`);
            if (rows.length > 5 && validRows === 0) {
                throw new Error(`Import failed. No valid records found in batch of ${rows.length}. Check column mapping/indices.`);
            }
        }
    });

    try {
        transaction(data);
        console.log(`Imported batch of ${data.length} records.`);
        res.json({ count: data.length });
    } catch (err) {
        console.error('Master Import Global Error:', err);
        res.status(500).json({ error: 'Import failed: ' + err.message });
    }
});

// Get CLF Data (All)
app.get('/api/clf-data', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM clf_data').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Sync CLF Data (Replace)
app.post('/api/clf-data/sync', (req, res) => {
    const { data } = req.body; // Expecting rows with TTX单号, 批次, PO
    const insert = db.prepare('INSERT INTO clf_data (ttx_po, batch, client_po) VALUES (?, ?, ?)');
    const clear = db.prepare('DELETE FROM clf_data');

    const transaction = db.transaction((rows) => {
        clear.run();
        for (const row of rows) {
            insert.run(row['TTX单号'] || row.ttx_po, row['批次'] || row.batch, row['PO'] || row.client_po);
        }
    });

    try {
        transaction(data);
        res.json({ count: data.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Upload API ---
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Return the path relative to server root
        res.json({ path: req.file.path.replace(/\\/g, '/') }); // Normalize slashes
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Image Cleanup API ---
app.delete('/api/cleanup-images', (req, res) => {
    try {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) return res.json({ deleted: 0 });

        const files = fs.readdirSync(uploadDir);
        const shipments = db.prepare('SELECT image_path FROM shipments WHERE image_path IS NOT NULL AND deleted_at IS NULL').all();
        const usedImages = new Set(shipments.map(s => path.basename(s.image_path)));

        let deletedCount = 0;
        files.forEach(file => {
            if (!usedImages.has(file)) {
                fs.unlinkSync(path.join(uploadDir, file));
                deletedCount++;
            }
        });

        res.json({ success: true, deleted: deletedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Couriers API ---
app.get('/api/couriers', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM couriers ORDER BY name ASC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- CLIENT PURPOSES API ---
app.get('/api/client-purposes', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM client_purposes ORDER BY client_name ASC').all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/client-purposes', (req, res) => {
    try {
        const { client_name, purpose } = req.body;
        if (!client_name) return res.status(400).json({ error: 'Client name is required' });

        const stmt = db.prepare(`
            INSERT INTO client_purposes (client_name, purpose) 
            VALUES (?, ?)
            ON CONFLICT(client_name) DO UPDATE SET purpose = excluded.purpose
        `);
        stmt.run(client_name, purpose);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/client-purposes/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM client_purposes WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- EXCEL EXPORT API ---
const ExcelJS = require('exceljs');
app.post('/api/export/stock-template', async (req, res) => {
    try {
        const { ids } = req.body;

        let items;
        if (!ids || ids.length === 0) {
            items = db.prepare('SELECT * FROM inventory WHERE deleted_at IS NULL ORDER BY date_in DESC').all();
        } else {
            const placeholders = ids.map(() => '?').join(',');
            items = db.prepare(`SELECT * FROM inventory WHERE id IN (${placeholders}) ORDER BY date_in DESC`).all(...ids);
        }

        // Fetch Purpose Map
        const purposeRows = db.prepare('SELECT client_name, purpose FROM client_purposes').all();
        const purposeMap = {};
        purposeRows.forEach(row => {
            purposeMap[row.client_name.toLowerCase()] = row.purpose;
        });

        // Create Workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Stock List');

        // Headers
        worksheet.columns = [
            { header: '日期', key: 'date', width: 15 },
            { header: '生产单号', key: 'po', width: 20 },
            { header: '生产名称', key: 'product', width: 30 },
            { header: '客户', key: 'client', width: 20 },
            { header: '取样大小', key: 'size', width: 15 },
            { header: '数量', key: 'qty', width: 10 },
            { header: '存货', key: 'current_qty', width: 10 },
            { header: '颜色风格手感确认', key: 'note', width: 30 },
            { header: '用途', key: 'purpose', width: 25 }
        ];

        // Style Headers
        worksheet.getRow(1).font = { bold: true, size: 12 };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(1).height = 25;

        // Add Data
        items.forEach(item => {
            // Determine Purpose
            const clientKey = (item.client || '').trim().toLowerCase();
            const purpose = purposeMap[clientKey] || '';

            worksheet.addRow({
                date: item.date_in,
                po: item.po,
                product: `${item.product || ''} ${item.item_no || ''}`.trim(),
                client: item.client,
                size: item.size,
                qty: item.original_qty,
                current_qty: item.current_qty,
                note: item.note,
                purpose: purpose
            });
        });

        // Apply Borders and Center Alignment to All Data Cells
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            });
            if (rowNumber > 1) {
                row.height = 20;
            }
        });

        // Response
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Stock_Export.xlsx');

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('Export Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/export/history-template', async (req, res) => {
    try {
        const { ids } = req.body;

        let items;
        if (!ids || ids.length === 0) {
            // Export All
            items = db.prepare('SELECT * FROM shipments WHERE deleted_at IS NULL ORDER BY date_sent DESC').all();
        } else {
            // Export Selected
            const placeholders = ids.map(() => '?').join(',');
            items = db.prepare(`SELECT * FROM shipments WHERE id IN (${placeholders}) ORDER BY date_sent DESC`).all(...ids);
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('History List');

        // Headers
        worksheet.columns = [
            { header: '日期', key: 'date', width: 15 },
            { header: '客户', key: 'client', width: 20 },
            { header: '生产单号', key: 'po', width: 20 },
            { header: '生产名称', key: 'product', width: 30 },
            { header: '数量', key: 'qty', width: 10 },
            { header: '收件人', key: 'recipient', width: 20 },
            { header: '快递', key: 'courier', width: 15 },
            { header: '单号', key: 'tracking', width: 20 }
        ];

        // Style Headers
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, size: 12 };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 25;

        // Add Data
        items.forEach(item => {
            worksheet.addRow({
                date: item.date_sent,
                client: item.client,
                po: item.po,
                product: item.product,
                qty: item.qty,
                recipient: item.recipient,
                courier: item.courier,
                tracking: item.tracking
            });
        });

        // Apply Borders and Alignment
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            });
            if (rowNumber > 1) {
                row.height = 20;
            }
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=History_Export.xlsx');

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('History Export Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- IMPORT API ---
// Note: We use a separate multer instance for imports to use MemoryStorage
const memoryUpload = multer({ storage: multer.memoryStorage() });

// Preview Endpoint
app.post('/api/import/preview', memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1); // First sheet

        const rows = [];
        // Read first 5 rows for preview
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber <= 5) {
                // row.values is [empty, col1, col2...], slice(1) to get real values
                const rowData = Array.isArray(row.values) ? row.values.slice(1) : row.values;
                rows.push(rowData);
            }
        });

        res.json({ rows });
    } catch (err) {
        console.error('Import Preview Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Helper: Parse Excel Date
const parseExcelDate = (val) => {
    if (!val) return '';
    // If Excel serial date (number > 25569)
    if (typeof val === 'number' && val > 25569) {
        // Excel base date: Dec 30 1899
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }
    // If JS Date object
    if (Object.prototype.toString.call(val) === '[object Date]') {
        return val.toISOString().split('T')[0];
    }
    // If String, try to normalize
    const str = String(val).trim();
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // Try DD/MM/YYYY or MM/DD/YYYY? Let's assume input might be localized
    // Simple fallback: return as string, user might need to fix. 
    // Or try Date.parse
    const ts = Date.parse(str);
    if (!isNaN(ts)) {
        return new Date(ts).toISOString().split('T')[0];
    }
    return str; // Return original if unknown
};

// Execute Endpoint
app.post('/api/import/execute', memoryUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const { target, mapping, startRow } = req.body;
        const colMap = JSON.parse(mapping); // { db_field: col_index }
        const startRowIdx = parseInt(startRow) || 2;

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1);

        let successCount = 0;
        let errors = [];

        db.transaction(() => {
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber < startRowIdx) return; // Skip headers

                try {
                    const getColVal = (dbField) => {
                        const colIdx = colMap[dbField];
                        if (!colIdx) return null;
                        const cell = row.getCell(colIdx);
                        // Return raw value for dates to handle in parseExcelDate
                        return cell.value;
                    };

                    if (target === 'inventory') {
                        // Required: date_in, po, product, original_qty
                        const dateIn = parseExcelDate(getColVal('date_in'));
                        const po = String(getColVal('po') || '');
                        const product = String(getColVal('product') || '');
                        const qtyStr = getColVal('original_qty');
                        const qty = parseInt(qtyStr) || 0;

                        // Optional: current_qty (default to original)
                        const currentQtyVal = getColVal('current_qty');
                        let currentQty = qty; // Default to original
                        if (currentQtyVal !== null && currentQtyVal !== undefined && String(currentQtyVal).trim() !== '') {
                            const parsed = parseInt(currentQtyVal);
                            if (!isNaN(parsed)) {
                                currentQty = parsed;
                            }
                        }

                        if (!dateIn || !po || !product || !qty) {
                            throw new Error(`Row ${rowNumber}: Missing required fields`);
                        }

                        db.prepare(`
                            INSERT INTO inventory (date_in, client, po, client_po, product, item_no, size, original_qty, current_qty, note, batch)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            dateIn,
                            String(getColVal('client') || ''),
                            po,
                            String(getColVal('client_po') || ''),
                            product,
                            String(getColVal('item_no') || ''),
                            String(getColVal('size') || ''),
                            qty,
                            currentQty,
                            String(getColVal('note') || ''),
                            String(getColVal('batch') || '')
                        );

                    } else if (target === 'history') {
                        // Required: date_sent, po, product, qty
                        const dateSent = parseExcelDate(getColVal('date_sent'));
                        const po = String(getColVal('po') || '');
                        const product = String(getColVal('product') || '');
                        const qtyStr = getColVal('qty');
                        const qty = parseInt(qtyStr) || 0;

                        if (!dateSent || !po || !product || !qty) {
                            throw new Error(`Row ${rowNumber}: Missing required fields`);
                        }

                        // Note: We do NOT impact stock for history import, it's just a record.
                        // But we need a dummy stock_id? The history view links to stock...
                        // Actually, shipment record has `stock_id`. If we confirm migration, maybe we can't link to real stock easily.
                        // For legacy import, maybe set stock_id to NULL or 0?
                        // The schema requires `stock_id`.
                        // Workaround: Create a "Legacy Stock" item? or Allow NULL?
                        // Let's check schema. `stock_id INTEGER` usually allows NULL unless NOT NULL specified.
                        // If strict, we might have issues. Let's try NULL.

                        db.prepare(`
                            INSERT INTO shipments (stock_id, po, client, product, recipient, courier, tracking, date_sent, qty)
                            VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            po,
                            String(getColVal('client') || ''),
                            product,
                            String(getColVal('recipient') || ''),
                            String(getColVal('courier') || ''),
                            String(getColVal('tracking') || ''),
                            dateSent,
                            qty
                        );
                    }
                    successCount++;
                } catch (e) {
                    errors.push(e.message);
                }
            });
        })(); // Execute transaction

        res.json({ success: successCount, errors: errors.slice(0, 10) }); // Limit error output

    } catch (err) {
        console.error('Import Execute Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/couriers', (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const info = db.prepare('INSERT OR IGNORE INTO couriers (name) VALUES (?)').run(name);
        const courier = db.prepare('SELECT * FROM couriers WHERE name = ?').get(name);
        res.json(courier);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DEBUG / DEV ROUTES ---
app.post('/api/debug/reset-db', (req, res) => {
    try {
        const transaction = db.transaction(() => {
            db.prepare("DELETE FROM shipments").run();
            db.prepare("DELETE FROM inventory").run();
            db.prepare("DELETE FROM couriers").run();
        });
        transaction();
        res.json({ success: true, message: 'Database reset successfully.' });
    } catch (err) {
        console.error('Reset DB Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- BACKUP SYSTEM ---
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

// Helper: Create Backup
const createBackup = async (label = 'manual') => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db_backup_${label}_${timestamp}.sqlite`;
    const target = path.join(BACKUP_DIR, filename);

    await db.backup(target);
    console.log(`Backup created: ${filename}`);
    return { filename, path: target };
};

// Scheduled Task: Monthly Backup (Run on startup check)
const runScheduledBackup = async () => {
    const date = new Date();
    const monthLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthlyFilePrefix = `db_backup_monthly_${monthLabel}`;

    // Check if we already have a backup for this month
    const files = fs.readdirSync(BACKUP_DIR);
    const hasMonthly = files.some(f => f.startsWith(monthlyFilePrefix));

    if (!hasMonthly) {
        console.log('Running automated monthly backup...');
        await createBackup(`monthly_${monthLabel}`);
    }
};
// Run check on startup
runScheduledBackup().catch(err => console.error('Scheduled backup failed:', err));

// Manual Backup Route
app.post('/api/backup', async (req, res) => {
    try {
        const result = await createBackup('manual');
        res.json({ success: true, message: `Backup created: ${result.filename}` });
    } catch (err) {
        console.error('Backup Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Restore Database Route
const Database = require('better-sqlite3');
app.post('/api/restore', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const backupPath = req.file.path;
        console.log(`Starting restore from: ${backupPath}`);

        // Open the uploaded database
        const sourceDb = new Database(backupPath, { readonly: true });

        // Backup FROM Source (Uploaded) TO Destination (Live DB)
        // db.backup matches the signature: backup(destination, options)
        // But here we want to overwrite 'db' (the live one).
        // better-sqlite3 documentation says: `db.backup(filename, options)` copies FROM db TO filename.
        // To copy FROM another file TO current db, we can use `sourceDb.backup(LIVE_DB_PATH)`.

        // However, 'db' is an open connection to 'database.sqlite'.
        // We cannot easily overwrite the file 'database.sqlite' while it is open by 'db'?
        // better-sqlite3 handles this safely if we use the API?
        // Actually, the safest way is:
        // 1. Close current DB? (Express might fail requests)
        // 2. Use `sourceDb.backup(LIVE_DB_PATH)`? 

        // Alternative: Use SQLite `VACUUM INTO`?
        // Let's try the `sourceDb.backup(LIVE_DB)` approach.
        // We need the absolute path of the live DB.

        const LIVE_DB_PATH = path.join(__dirname, 'database.sqlite');

        // We must ensure the source is valid.
        try {
            await sourceDb.backup(LIVE_DB_PATH);
        } catch (backupErr) {
            sourceDb.close(); // Close source
            throw backupErr;
        }

        sourceDb.close();

        // Clean up uploaded file
        fs.unlinkSync(backupPath);

        console.log('Database restored successfully.');
        res.json({ success: true, message: 'Database restored. Reloading...' });

        // Optional: Exit process to force restart/reload of DB connection?
        // better-sqlite3 connection `db` might be stale or invalid if file underneath changed?
        // Since we overwrote the file, the file descriptor might be weird?
        // Most reliable way for SQLite to pick up fresh file is to close/reopen or restart process.
        // We will tell Frontend to reload, but Backend state might need refresh.
        // Let's exit process (PM2/Supervisor or just manual restart)??
        // Or just close and reopen global `db`? 
        // `db` module exports an instance. We can't restart it easily.
        // BUT: better-sqlite3 usually handles WAL file updates. Direct overwrite might break WAL?

        // Recommendation: Backup -> Restore -> Restart Server.
        // We will return success and let user restart.

    } catch (err) {
        console.error('Restore Error:', err);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});