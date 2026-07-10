// ===================== BILL-HIVE SHARED CHROME =====================
// Common header / sidebar / theme / utility functions shared by the
// standalone pages (brands.html, suppliers.html, fulfillment.html, catalogue.html).
// index.html does NOT include this file — it already defines these
// in script.js.

// ===================== INDEXEDDB WRAPPER (v4.01.0) =====================
// Standalone pages don't load script.js, so they carry their own copy
// of the IndexedDB wrapper.
const DB_NAME = 'billhive-db';
const DB_VERSION = 1;

const STORE_NAMES = [
    'company', 'settings', 'config', 'items', 'stocklog',
    'bills', 'returns', 'brands', 'suppliers', 'purchaseOrders', 'meta', 'theme'
];

const STORE_MAP = {
    'billhive-company': 'company',
    'billhive-settings': 'settings',
    'billhive-config': 'config',
    'billhive-items': 'items',
    'billhive-stocklog': 'stocklog',
    'billhive-bills': 'bills',
    'billhive-returns': 'returns',
    'billhive-brands': 'brands',
    'billhive-suppliers': 'suppliers',
    'billhive-purchase-orders': 'purchaseOrders',
    'billhive-meta': 'meta',
    'billhive-theme': 'theme'
};

let db = null;
let dbFailed = false;

function dbInit() {
    return new Promise((resolve) => {
        if (!window.indexedDB) {
            console.warn('IndexedDB not available — falling back to localStorage');
            dbFailed = true;
            resolve(null);
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => {
            console.warn('IndexedDB failed to open — falling back to localStorage', request.error);
            dbFailed = true;
            resolve(null);
        };
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            STORE_NAMES.forEach(name => {
                if (!database.objectStoreNames.contains(name)) {
                    database.createObjectStore(name);
                }
            });
        };
    }).then(() => migrateFromLocalStorage());
}

function migrateFromLocalStorage() {
    if (dbFailed) return Promise.resolve();
    const migrations = [];
    Object.entries(STORE_MAP).forEach(([lsKey, storeName]) => {
        const data = localStorage.getItem(lsKey);
        if (data !== null) {
            let parsed;
            try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
            migrations.push(dbSet(storeName, parsed).then(() => localStorage.removeItem(lsKey)));
        }
    });
    return Promise.all(migrations);
}

function dbGet(storeName) {
    if (dbFailed) {
        const lsKey = Object.keys(STORE_MAP).find(k => STORE_MAP[k] === storeName);
        try {
            const raw = localStorage.getItem(lsKey);
            return Promise.resolve(raw !== null ? JSON.parse(raw) : null);
        } catch (e) { return Promise.resolve(null); }
    }
    return new Promise((resolve, reject) => {
        if (!db) { resolve(null); return; }
        try {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get('data');
            request.onsuccess = () => resolve(request.result !== undefined ? request.result : null);
            request.onerror = () => reject(request.error);
        } catch (e) { resolve(null); }
    });
}

function dbSet(storeName, value) {
    if (dbFailed) {
        const lsKey = Object.keys(STORE_MAP).find(k => STORE_MAP[k] === storeName);
        try {
            localStorage.setItem(lsKey, JSON.stringify(value));
            return Promise.resolve();
        } catch (e) { return Promise.reject(e); }
    }
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('DB not initialized')); return; }
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(value, 'data');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function dbRemove(storeName) {
    if (dbFailed) {
        const lsKey = Object.keys(STORE_MAP).find(k => STORE_MAP[k] === storeName);
        localStorage.removeItem(lsKey);
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        if (!db) { resolve(); return; }
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete('data');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function dbClearAll() {
    return Promise.all(STORE_NAMES.map(name => dbRemove(name)));
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Currency symbol is cached after load so formatCurrency() can stay
// synchronous for use inside template-literal render functions.
let cachedCurrencySymbol = '₹';

async function loadCurrencySymbol() {
    try {
        const s = await dbGet('settings');
        if (s && s.currencySymbol) cachedCurrencySymbol = s.currencySymbol;
    } catch (e) {}
}

function getCurrencySymbol() {
    return cachedCurrencySymbol;
}

function formatCurrency(amount) {
    return getCurrencySymbol() + ' ' + parseFloat(amount || 0).toFixed(2);
}

function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function showToast(message) {
    const toast = $('#toast');
    const toastMessage = $('#toast-message');
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===================== SIDEBAR =====================
function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#sidebar-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#sidebar-overlay').classList.remove('active');
    document.body.style.overflow = '';
}

// ===================== THEME =====================
async function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.contains('dark-mode');
    if (isDark) {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        await dbSet('theme', 'light');
    } else {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        await dbSet('theme', 'dark');
    }
}

async function initTheme() {
    const savedTheme = await dbGet('theme');
    if (savedTheme === 'dark') {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
    }
}

// ===================== HEADER LOGO =====================
function updateHeaderLogo(logoUrl) {
    const headerImg = $('#header-logo');
    const headerPlaceholder = $('#header-logo-placeholder');
    if (!headerImg || !headerPlaceholder) return;
    if (logoUrl) {
        headerImg.src = logoUrl;
        headerImg.style.display = 'block';
        headerPlaceholder.style.display = 'none';
    } else {
        headerImg.style.display = 'none';
        headerPlaceholder.style.display = 'flex';
    }
}

async function loadHeaderCompanyLogo() {
    try {
        const data = await dbGet('company');
        if (data && data.logo) updateHeaderLogo(data.logo);
    } catch (e) { console.error('Error loading company logo:', e); }
}

// ===================== SHARED CHROME INIT =====================
async function initChrome() {
    await dbInit();
    await initTheme();
    await loadCurrencySymbol();
    await loadHeaderCompanyLogo();
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSidebar();
    });
}

document.addEventListener('DOMContentLoaded', initChrome);

// ===================== PWA INSTALL (chrome pages) =====================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('pwa-install-btn');
    const div = document.getElementById('pwa-install-divider');
    if (btn) { btn.style.display = 'flex'; }
    if (div) { div.style.display = 'block'; }
});

function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
        deferredPrompt = null;
        const btn = document.getElementById('pwa-install-btn');
        const div = document.getElementById('pwa-install-divider');
        if (btn) btn.style.display = 'none';
        if (div) div.style.display = 'none';
    });
}

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
});
