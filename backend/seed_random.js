const db = require('./db');

const products = ['Cotton Shirt', 'Denim Jeans', 'Leather Jacket', 'Running Shoes', 'Backpack', 'Wristwatch', 'Sunglasses', 'Wool Sweater', 'Baseball Cap', 'Socks'];
const batches = ['BATCH-001', 'BATCH-002', 'BATCH-X', 'SAMPLE-A', 'PROD-FINAL'];
const sizes = ['S', 'M', 'L', 'XL', 'XXL', 'OneSize'];

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const insertStmt = db.prepare(`
    INSERT INTO inventory (date_in, po, client_po, product, item_no, size, batch, original_qty, current_qty, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const transaction = db.transaction(() => {
    for (let i = 0; i < 20; i++) {
        const dateIn = new Date(Date.now() - getRandomInt(0, 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const po = `PO-RAND-${getRandomInt(1000, 9999)}`;
        const clientPo = `CPO-${getRandomInt(100, 999)}`;
        const product = getRandomItem(products);
        const itemNo = `ITM-${getRandomInt(100, 999)}`;
        const size = getRandomItem(sizes);
        const batch = getRandomItem(batches);
        const qty = getRandomInt(10, 1000);

        insertStmt.run(dateIn, po, clientPo, product, itemNo, size, batch, qty, qty, 'Auto-generated test item');
    }
});

try {
    transaction();
    console.log('Successfully inserted 20 random items.');
} catch (error) {
    console.error('Error inserting data:', error);
}
