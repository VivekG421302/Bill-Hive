// ===================== BILL-HIVE SHARED CHROME =====================
// Common header / sidebar / theme / utility functions shared by the
// standalone pages (brands.html, suppliers.html, fulfillment.html, catalogue.html).
// index.html does NOT include this file — it already defines these
// in script.js.

// ===================== INDEXEDDB WRAPPER (v4.01.0) =====================
// Standalone pages don't load script.js, so they carry their own copy
// of the IndexedDB wrapper.
const DB_NAME = 'billhive-db';
const DB_VERSION = 2; // v4.01.0 Task 7: bumped to add the 'columnVisibility' store

const STORE_NAMES = [
    'company', 'settings', 'config', 'items', 'stocklog',
    'bills', 'returns', 'brands', 'suppliers', 'purchaseOrders', 'meta', 'theme',
    'columnVisibility'
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

// ===================== SIDEBAR SIDE (v4.02.0 Part 1) =====================
// Standalone pages have no Settings UI of their own — they just read and
// apply whatever was chosen on index.html's Settings page.
function applySidebarSide(side) {
    document.body.classList.toggle('side-left', side === 'left');
}

// ===================== ACCENT COLOR (v4.02.0 Part 1) =====================
function applyAccentColor(hex) {
    // See script.js's applyAccentColor for why this targets body, not html.
    const target = document.body;
    if (hex) {
        target.style.setProperty('--accent-primary', hex);
        target.style.setProperty('--accent-primary-hover', shadeColor(hex, -12));
    } else {
        target.style.removeProperty('--accent-primary');
        target.style.removeProperty('--accent-primary-hover');
    }
}

function shadeColor(hex, percent) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return hex ? ('#' + hex) : '#1c7ed6';
    const num = parseInt(hex, 16);
    let r = (num >> 16) + Math.round(255 * percent / 100);
    let g = ((num >> 8) & 0x00FF) + Math.round(255 * percent / 100);
    let b = (num & 0x0000FF) + Math.round(255 * percent / 100);
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

// ===================== SCREEN SAVER (v4.02.0 Part 1) =====================
let screensaverTimer = null;
let screensaverSecondsActive = 30;
let screensaverEnabledActive = false;
let screensaverListenersBound = false;

function showScreensaver() {
    const overlay = $('#screensaver-overlay');
    if (overlay) overlay.classList.add('active');
}

function hideScreensaver() {
    const overlay = $('#screensaver-overlay');
    if (overlay) overlay.classList.remove('active');
}

function resetScreensaverTimer() {
    if (screensaverTimer) clearTimeout(screensaverTimer);
    hideScreensaver();
    if (!screensaverEnabledActive) return;
    screensaverTimer = setTimeout(showScreensaver, screensaverSecondsActive * 1000);
}

function initScreensaver(enabled, seconds) {
    screensaverEnabledActive = !!enabled;
    screensaverSecondsActive = (seconds && seconds > 0) ? seconds : 30;
    if (!screensaverListenersBound) {
        screensaverListenersBound = true;
        ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
            document.addEventListener(evt, resetScreensaverTimer, { passive: true });
        });
    }
    resetScreensaverTimer();
}

async function applySavedUiPrefs() {
    try {
        const settings = await dbGet('settings');
        applySidebarSide((settings && settings.sidebarSide) || 'right');
        applyAccentColor((settings && settings.accentColor) || '');
        const ss = (settings && settings.screensaver) || { enabled: false, seconds: 30 };
        initScreensaver(ss.enabled, ss.seconds);
    } catch (e) { console.error('Error applying UI preferences:', e); }
}

// ===================== SCROLL & DRAG OPTIMIZATION (v4.02.0 Part 1) =====================
function enableDragScroll(el) {
    if (!el || el._dragScrollBound) return;
    el._dragScrollBound = true;
    let isDown = false, startX = 0, scrollLeft = 0, moved = false;

    el.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, a, input, select, textarea')) return;
        isDown = true;
        moved = false;
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
    });

    ['mouseleave', 'mouseup'].forEach(evt => el.addEventListener(evt, () => {
        isDown = false;
        el.classList.remove('dragging');
    }));

    el.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - el.offsetLeft;
        const walk = x - startX;
        if (Math.abs(walk) > 5) {
            moved = true;
            el.classList.add('dragging');
        }
        if (moved) {
            e.preventDefault();
            el.scrollLeft = scrollLeft - walk;
        }
    });

    el.addEventListener('click', (e) => {
        if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    }, true);
}

function initDragScrollAll() {
    $$('.table-wrap').forEach(enableDragScroll);
}

// ===================== ROW-CLICK-TO-OPEN PATTERN (v4.02.0 Part 1) =====================
// Reusable helper: makes a table row / card clickable to open its detail
// view, while inner buttons/links/inputs still work normally.  Usage:
//   makeRowClickable(rowEl, () => viewSupplier(s.id));
function makeRowClickable(el, onOpen) {
    if (!el) return;
    el.classList.add('row-clickable');
    el.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input, select, textarea, label')) return;
        onOpen();
    });
}

// ===================== COLUMN VISIBILITY (v4.01.0 Task 7) =====================
// NOTE: this system already lives per-page (see suppliers.html's and
// fulfillment.html's page-specific <script> blocks, each with their own
// TABLE_COLUMNS map) rather than here in the shared chrome layer, so that
// pages which don't need it don't declare an unused `const TABLE_COLUMNS`
// that could collide with a page-specific one of the same name. When adding
// the picker to a new table, copy that pattern into the page's own script:
// a `TABLE_COLUMNS` map of `tableId -> [column names]`, plus
// loadColumnVisibility/saveColumnVisibility/applyColumnVisibility/
// initColumnVisibility/renderColumnToggles/toggleColumn/toggleColumnDropdown,
// all backed by the shared `columnVisibility` IndexedDB store (already
// created by dbInit() above via STORE_NAMES).

// ===================== CUSTOM CONFIRM MODAL (v4.01.0) =====================
let _confirmResolve = null;

function showConfirm(message, title = 'Confirm') {
    return new Promise((resolve) => {
        _confirmResolve = resolve;
        const titleEl  = document.getElementById('confirm-modal-title');
        const msgEl    = document.getElementById('confirm-modal-message');
        const modal    = document.getElementById('confirm-modal');
        const yesBtn   = document.getElementById('confirm-yes-btn');
        if (!modal) { resolve(window.confirm(message)); return; } // graceful fallback
        if (titleEl) titleEl.textContent = title;
        if (msgEl)   msgEl.textContent   = message;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        yesBtn.onclick = () => { closeConfirmModal(); resolve(true); };
    });
}

function closeConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
    if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
}

// ===================== SHARED CHROME INIT =====================
async function initChrome() {
    await dbInit();
    await initTheme();
    await loadCurrencySymbol();
    await loadHeaderCompanyLogo();
    await applySavedUiPrefs(); // v4.02.0 Part 1 — sidebar side, accent color, screen saver
    initDragScrollAll();       // v4.02.0 Part 1 — drag-to-scroll on wide tables
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