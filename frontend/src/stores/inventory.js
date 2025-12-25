import { defineStore } from 'pinia';
import axios from 'axios';
import { useDebugStore } from './debug';

export const useInventoryStore = defineStore('inventory', {
    state: () => ({
        inventory: [],
        shipments: [],
        masterData: [],
        clfData: [],
        couriers: [],
        draft: [], // { stockId, po, product, ... }
        loading: false,
        error: null
    }),
    getters: {
        currentInventory: (state) => state.inventory,
        getHistory: (state) => state.shipments,
        masterDataCount: (state) => state.masterData.length,
        clfDataCount: (state) => state.clfData.length
    },
    actions: {
        async fetchAll(force = false) {
            this.loading = true;
            const debugStore = useDebugStore();
            try {
                debugStore.addLog('fetchAll started', 'info');

                const timeReq = async (name, fn) => {
                    const start = performance.now();
                    // debugStore.addLog(`Starting fetch: ${name}`, 'info');
                    try {
                        const res = await fn();
                        debugStore.addLog(`${name} finished in ${(performance.now() - start).toFixed(0)}ms`, 'success');
                        return res;
                    } catch (e) {
                        debugStore.addLog(`${name} failed after ${(performance.now() - start).toFixed(0)}ms`, 'error', e);
                        throw e;
                    }
                }

                // Always fetch dynamic data (inventory, shipments)
                const promises = [
                    timeReq('Inventory', () => axios.get('/api/inventory')),
                    timeReq('Shipments', () => axios.get('/api/shipments'))
                ];

                // Only fetch static data (master, clf) if empty or forced
                const needMaster = force || this.masterData.length === 0;
                const needClf = force || this.clfData.length === 0;

                if (needMaster) promises.push(timeReq('Master Data', () => axios.get('/api/master-data')));
                if (needClf) promises.push(timeReq('CLF Data', () => axios.get('/api/clf-data')));

                // Fetch Couriers (Always, fast)
                promises.push(timeReq('Couriers', () => axios.get('/api/couriers')));

                const results = await Promise.all(promises);

                this.inventory = results[0].data;
                this.shipments = results[1].data;

                // Handle conditional results
                let idx = 2;
                if (needMaster) {
                    this.masterData = results[idx++].data;
                }
                if (needClf) {
                    this.clfData = results[idx++].data;
                }

                // Couriers is last
                this.couriers = results[idx] ? results[idx].data : [];
                debugStore.addLog('fetchAll completed successfully', 'success');
            } catch (err) {
                this.error = err.message;
                console.error(err);
                debugStore.addLog(`fetchAll failed: ${err.message}`, 'error', err);
            } finally {
                this.loading = false;
            }
        },

        async addStock(item) {
            try {
                const res = await axios.post('/api/inventory', item);
                // The backend returns the item with ID. Add to state.
                this.inventory.unshift(res.data);
                return res.data;
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async addCourier(name) {
            try {
                const res = await axios.post('/api/couriers', { name });
                // Check if exists
                if (!this.couriers.find(c => c.name === res.data.name)) {
                    this.couriers.push(res.data);
                    // Sort alpha
                    this.couriers.sort((a, b) => a.name.localeCompare(b.name));
                }
                return res.data;
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async updateStock(id, data) {
            try {
                await axios.put(`/api/inventory/${id}`, data);
                // Update local state
                const idx = this.inventory.findIndex(i => i.id === id);
                if (idx !== -1) {
                    this.inventory[idx] = { ...this.inventory[idx], ...data };
                    // Recalculate current if needed? 
                    // Simplest is to reload or trust optimistic update.
                    // The backend update logic was: newCurrent = oldCurrent + delta
                    // Let's rely on fetchAll or just simple field update for now.
                    // A robust way: fetch updated item? 
                    // For now: update fields we sent. 
                    // But wait, `current_qty` changes based on `original_qty` diff.
                    // We should refetch mostly.
                    const invRes = await axios.get('/api/inventory');
                    this.inventory = invRes.data;
                }
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async deleteStock(id) {
            try {
                await axios.delete(`/api/inventory/${id}`);
                this.inventory = this.inventory.filter(i => i.id !== id);
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async syncMasterData(data, mapping, clear = true) {
            try {
                const res = await axios.post('/api/master-data/sync', { data, mapping, clear });
                // We don't fetchAll here every time for chunks, caller should fetchAll at the end.
                // But for backward compatibility with single call:
                if (clear && data.length < 5000) {
                    await this.fetchAll();
                }
                return res.data;
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async syncClfData(data) {
            try {
                const res = await axios.post('/api/clf-data/sync', { data });
                this.clfData = data;
                return res.data;
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        // Draft Actions
        addToDraft(stockItems) {
            // stockItems: Array of inventory objects
            stockItems.forEach(item => {
                // Avoid duplicates? Or allow?
                this.draft.push({
                    stockId: item.id,
                    po: item.po,
                    client: item.client,
                    product: item.product,
                    itemNo: item.item_no || item.itemNo, // handle snake/camel
                    batch: item.batch,
                    recipient: '',
                    courier: 'SF',
                    tracking: '',
                    qty: 1, // Default to 1 to send
                    maxQty: item.current_qty || item.currentQty || 0, // Store max available
                    size: item.size || ''
                });
            });
        },

        removeFromDraft(index) {
            this.draft.splice(index, 1);
        },

        async confirmShipment(dateSent, imagePath = null) {
            try {
                await axios.post('/api/shipments', { items: this.draft, dateSent, imagePath });
                // Clear draft
                this.draft = [];
                // Refresh Data
                await this.fetchAll();
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },


        async deleteShipment(id) {
            try {
                await axios.post(`/api/shipments/trash/${id}`);
                await this.fetchAll();
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async revertShipment(id) {
            try {
                await axios.delete(`/api/shipments/${id}`);
                await this.fetchAll();
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async revertShipments(ids) {
            try {
                // Execute all deletes concurrently
                await Promise.all(ids.map(id => axios.delete(`/api/shipments/${id}`)));
                await this.fetchAll();
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        // Trash Actions
        async fetchTrash() {
            try {
                const [invTrash, shipTrash] = await Promise.all([
                    axios.get('/api/inventory/trash'),
                    axios.get('/api/shipments/trash')
                ]);
                return {
                    inventory: invTrash.data,
                    shipments: shipTrash.data
                };
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async restoreStock(id) {
            try {
                await axios.post(`/api/inventory/restore/${id}`);
                await this.fetchAll(); // specific refresh better but fetchAll is safe
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async permanentDelete(id) {
            try {
                await axios.delete(`/api/inventory/trash/${id}`);
                // No need to fetchAll if we are just viewing trash, but we might want to refresh trash list in view
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async restoreShipment(id) {
            try {
                await axios.post(`/api/shipments/restore/${id}`);
                await this.fetchAll();
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async permanentDeleteShipment(id) {
            try {
                await axios.delete(`/api/shipments/trash/${id}`);
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async uploadImage(file) {
            const formData = new FormData();
            formData.append('file', file);
            try {
                const res = await axios.post('/api/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                return res.data.path;
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async exportStockTemplate(ids) {
            try {
                const res = await axios.post('/api/export/stock-template', { ids }, { responseType: 'blob' });
                // Create download link
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'Stock_Export.xlsx');
                document.body.appendChild(link);
                link.click();
                link.remove();
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        },

        async exportHistoryTemplate(ids) {
            try {
                const res = await axios.post('/api/export/history-template', { ids }, { responseType: 'blob' });
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'History_Export.xlsx');
                document.body.appendChild(link);
                link.click();
                link.remove();
            } catch (err) {
                this.error = err.message;
                throw err;
            }
        }
    }
});
