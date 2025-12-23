const db = require('./backend/db');
console.log('Inventory:', db.prepare('SELECT COUNT(*) as c FROM inventory').get().c);
console.log('Master:', db.prepare('SELECT COUNT(*) as c FROM master_data').get().c);
console.log('Shipments:', db.prepare('SELECT COUNT(*) as c FROM shipments').get().c);
process.exit(0);
