const path = require('path');
const fs = require('fs');

/**
 * Determines the Root Directory for DATA storage.
 * 
 * We use process.cwd() (Current Working Directory).
 * - In Dev: This is the backend folder (or project root depending on how you start).
 * - In Prod (Exe): This is the folder containing the .exe (since you launch it from there).
 * 
 * This is the most reliable way to ensure "Portable" behavior where data stays with the app.
 */

const ROOT_DIR = path.join(process.env.APPDATA, 'com.samplemanager.app');
if (!fs.existsSync(ROOT_DIR)) {
    fs.mkdirSync(ROOT_DIR, { recursive: true });
}

module.exports = {
    ROOT_DIR,
    // Helper to check if we are compiled (optional usage)
    isCompiled: !process.argv[0].includes('node.exe')
};
