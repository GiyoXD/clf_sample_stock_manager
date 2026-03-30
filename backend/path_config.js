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

// Persistent Data Root: Standard Windows AppData
// We prioritize Roaming because it's where Tauri's app_data_dir() points to by default on Windows
const APPDATA = process.env.APPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : null);

if (!APPDATA) {
    console.error("CRITICAL ERROR: Could not determine AppData directory. Data persistence may fail.");
}

const ROOT_DIR = APPDATA ? path.join(APPDATA, 'com.samplemanager.app') : process.cwd();

if (!fs.existsSync(ROOT_DIR)) {
    try {
        fs.mkdirSync(ROOT_DIR, { recursive: true });
    } catch (e) {
        console.error(`FAILED to create ROOT_DIR: ${ROOT_DIR}`, e);
    }
}

module.exports = {
    ROOT_DIR,
    // Helper to check if we are running in a bundled executable (pkg or caxa)
    isCompiled: !!(process.pkg || process.env.CAXA) || !process.argv[0].toLowerCase().includes('node.exe')
};
