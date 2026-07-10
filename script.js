// ===================== BILL-HIVE APP =====================
// Complete POS Billing Application

// ===================== INDEXEDDB WRAPPER (v4.01.0) =====================
// Replaces all localStorage usage. Falls back to localStorage if IndexedDB
// is unavailable or fails to open.
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
let dbFailed = false; // true if IndexedDB could not be opened — fall back to localStorage

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
            try {
                parsed = JSON.parse(data);
            } catch (e) {
                parsed = data; // e.g. theme was stored as a plain string
            }
            migrations.push(
                dbSet(storeName, parsed).then(() => {
                    localStorage.removeItem(lsKey);
                })
            );
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
        } catch (e) {
            return Promise.resolve(null);
        }
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
        } catch (e) {
            return Promise.reject(e);
        }
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

// ===================== COLUMN VISIBILITY (v4.01.0 — Task 7) =====================
// Reusable column show/hide system for data tables. Visibility is an array
// of booleans (true = shown) positionally matched to TABLE_COLUMNS, and is
// persisted in the 'columnVisibility' IndexedDB store as
// { [tableId]: [bool, bool, ...] }.
const TABLE_COLUMNS = {
    'items-table': ['Name', 'SKU', 'Brand', 'Price', 'Cost', 'Disc %', 'Tax %', 'Stock', 'Actions'],
    'stock-table': ['Item', 'Tracking', 'Current Stock', 'Status', 'Actions'],
    'past-bills-table': ['Invoice', 'Date', 'Customer', 'Amount', 'Payment', 'Actions'],
    'returns-table': ['Date', 'Invoice', 'Customer', 'Refund']
};

let columnVisibilityCache = {};

async function loadColumnVisibility(tableId) {
    const cols = TABLE_COLUMNS[tableId] || [];
    const cached = columnVisibilityCache[tableId];
    if (cached && cached.length === cols.length) return cached;
    let all = {};
    try { all = (await dbGet('columnVisibility')) || {}; } catch (e) { all = {}; }
    const saved = all[tableId];
    const visibility = (Array.isArray(saved) && saved.length === cols.length) ? saved.slice() : cols.map(() => true);
    columnVisibilityCache[tableId] = visibility;
    return visibility;
}

async function saveColumnVisibility(tableId) {
    let all = {};
    try { all = (await dbGet('columnVisibility')) || {}; } catch (e) { all = {}; }
    all[tableId] = columnVisibilityCache[tableId];
    await dbSet('columnVisibility', all);
}

function applyColumnVisibility(tableId) {
    const visibility = columnVisibilityCache[tableId];
    const table = document.getElementById(tableId);
    if (!table || !visibility) return;
    table.querySelectorAll('thead tr th').forEach((th, i) => {
        th.classList.toggle('col-hidden', visibility[i] === false);
    });
    table.querySelectorAll('tbody tr').forEach(tr => {
        Array.from(tr.children).forEach((td, i) => {
            if (i < visibility.length) td.classList.toggle('col-hidden', visibility[i] === false);
        });
    });
}

async function initColumnVisibility(tableId) {
    await loadColumnVisibility(tableId);
    applyColumnVisibility(tableId);
}

async function renderColumnToggles(tableId) {
    const cols = TABLE_COLUMNS[tableId] || [];
    const visibility = await loadColumnVisibility(tableId);
    const dropdown = document.getElementById(tableId + '-column-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = cols.map((name, i) => `
        <label class="column-toggle-item">
            <input type="checkbox" ${visibility[i] !== false ? 'checked' : ''} onchange="toggleColumn('${tableId}', ${i})">
            <span>${escapeHtml(name)}</span>
        </label>
    `).join('');
}

async function toggleColumn(tableId, columnIndex) {
    const visibility = await loadColumnVisibility(tableId);
    visibility[columnIndex] = visibility[columnIndex] === false ? true : false;
    columnVisibilityCache[tableId] = visibility;
    await saveColumnVisibility(tableId);
    applyColumnVisibility(tableId);
}

async function toggleColumnDropdown(tableId) {
    const dropdown = document.getElementById(tableId + '-column-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.column-toggle-dropdown.open').forEach(d => d.classList.remove('open'));
    if (!isOpen) {
        await renderColumnToggles(tableId);
        dropdown.classList.add('open');
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.column-toggle-wrap')) {
        document.querySelectorAll('.column-toggle-dropdown.open').forEach(d => d.classList.remove('open'));
    }
});

// ===================== STATE =====================
const AppState = {
    lineItems: [],
    currentPage: 'create-bill',
    paymentMode: 'cash',
    invoiceCount: {}, // { '2607': 5 }
    companyData: {
        name: '',
        gst: '',
        address: '',
        phone: '',
        email: '',
        logo: ''
    },
    settings: {
        thankYouMessages: [
            'Thank you for your business!',
            'Have a nice day!',
            'We appreciate your trust in us.'
        ],
        termsConditions: 'Goods once sold will not be taken back.\nAll disputes subject to local jurisdiction.',
        currencySymbol: '₹',
        print: {
            fontWeight: 'bold',
            paperSize: '80mm'
        }
    },
    config: {
        dbProvider: 'none',
        apiUrl: '',
        apiKey: '',
        syncEnabled: false
    },
    items: [],
    stockLog: [],
    savedBills: [],
    salesReturns: []
};

let itemIdCounter = 0;
let editingItemId = null;

// ===================== UTILITY FUNCTIONS =====================
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function formatCurrency(amount) {
    const symbol = AppState.settings.currencySymbol || '₹';
    return symbol + ' ' + parseFloat(amount).toFixed(2);
}

function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(date) {
    const d = new Date(date);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function generateInvoiceNumber() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const key = yy + mm;

    if (!AppState.invoiceCount[key]) {
        AppState.invoiceCount[key] = 1;
    } else {
        AppState.invoiceCount[key]++;
    }

    const nn = String(AppState.invoiceCount[key]).padStart(2, '0');
    saveInvoiceMeta();
    return yy + mm + nn;
}

function numberToWords(num) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function convert(n) {
        if (n === 0) return '';
        if (n < 10) return ones[n];
        if (n < 20) return teens[n - 10];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
        if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convert(n % 100) : '');
        if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '');
        if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convert(n % 100000) : '');
        return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convert(n % 10000000) : '');
    }

    if (num === 0) return 'Zero';
    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);
    let result = convert(rupees) + ' Rupees';
    if (paise > 0) {
        result += ' and ' + convert(paise) + ' Paise';
    }
    return result + ' Only';
}

function showToast(message, type = 'success') {
    const toast = $('#toast');
    const toastMessage = $('#toast-message');
    toastMessage.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===================== CUSTOM CONFIRM MODAL (v4.01.0) =====================
// Replaces all native confirm() dialogs with a styled, promise-based modal.
let _confirmResolve = null;

function showConfirm(message, title = 'Confirm') {
    return new Promise((resolve) => {
        _confirmResolve = resolve;
        $('#confirm-modal-title').textContent = title;
        $('#confirm-modal-message').textContent = message;
        $('#confirm-modal').classList.add('active');
        document.body.style.overflow = 'hidden';

        const yesBtn = $('#confirm-yes-btn');
        // Remove any previous listener before adding a fresh one
        yesBtn.onclick = () => { closeConfirmModal(); resolve(true); };
    });
}

function closeConfirmModal() {
    $('#confirm-modal').classList.remove('active');
    document.body.style.overflow = '';
    if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
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

function navigateTo(page) {
    AppState.currentPage = page;

    // Update sidebar active state
    $$('.sidebar-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === page) {
            link.classList.add('active');
        }
    });

    // Show/hide pages
    $$('.page').forEach(p => p.classList.remove('active'));
    const targetPage = $(`#page-${page}`);
    if (targetPage) targetPage.classList.add('active');

    // Keep the URL hash in sync so other pages (e.g. Suppliers, Fulfillment)
    // can deep-link back into a specific section, e.g. index.html#stock
    if (history.replaceState) history.replaceState(null, '', `#${page}`);

    // Close sidebar
    closeSidebar();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Refresh page-specific data
    if (page === 'past-bills') renderPastBills();
    if (page === 'items') renderItemsTable();
    if (page === 'stock') renderStockTable();
    if (page === 'sales-return') { populateReturnBillSelect(); renderReturnsTable(); }
    if (page === 'sale-summary') renderSaleSummary();
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

// ===================== LINE ITEMS =====================
let lineItemIdCounter = 0;

function createLineItem(itemData = null) {
    lineItemIdCounter++;
    const id = lineItemIdCounter;

    const item = {
        id: id,
        name: itemData ? itemData.name : '',
        qty: itemData ? itemData.qty : 1,
        price: itemData ? itemData.price : 0,
        discount: itemData ? itemData.discount : 0,
        tax: itemData ? itemData.tax : 0,
        total: 0
    };

    calculateLineItemTotal(item);
    return item;
}

function calculateLineItemTotal(item) {
    const qty = parseFloat(item.qty) || 0;
    const price = parseFloat(item.price) || 0;
    const discount = parseFloat(item.discount) || 0;
    const tax = parseFloat(item.tax) || 0;

    const amountBeforeDiscount = qty * price;
    const discountAmount = amountBeforeDiscount * (discount / 100);
    const amountAfterDiscount = amountBeforeDiscount - discountAmount;
    const taxAmount = amountAfterDiscount * (tax / 100);

    item.total = amountAfterDiscount + taxAmount;
    item.discountAmount = discountAmount;
    item.taxAmount = taxAmount;
    item.amountBeforeDiscount = amountBeforeDiscount;
}

function addLineItem(itemData = null) {
    const item = createLineItem(itemData);
    AppState.lineItems.push(item);
    renderLineItems();
    calculateTotals();
}

function removeLineItem(id) {
    AppState.lineItems = AppState.lineItems.filter(item => item.id !== id);
    renderLineItems();
    calculateTotals();
}

function updateLineItem(id, field, value) {
    const item = AppState.lineItems.find(i => i.id === id);
    if (!item) return;

    item[field] = value;
    calculateLineItemTotal(item);

    // Update total display for this item
    const totalEl = $(`#line-item-total-${id}`);
    if (totalEl) {
        totalEl.textContent = formatCurrency(item.total);
    }

    calculateTotals();
}

function renderLineItems() {
    const container = $('#line-items-container');
    if (!container) return;

    if (AppState.lineItems.length === 0) {
        container.innerHTML = `
            <div class="placeholder-content" style="padding: 30px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:36px;height:36px;opacity:0.4;">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                    <rect x="9" y="3" width="6" height="4" rx="1"/>
                </svg>
                <p style="font-size:0.875rem;color:var(--text-muted);">No items added yet. Click "Add Item" to start.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = AppState.lineItems.map((item, index) => `
        <div class="line-item" data-id="${item.id}" id="line-item-${item.id}">
            <div class="line-item-content">
                <div class="line-item-header">
                    <span class="line-item-number">${index + 1}</span>
                    <div class="line-item-name-wrap">
                        <input type="text" class="line-item-name" 
                            value="${item.name}" 
                            placeholder="Search or type item name"
                            autocomplete="off"
                            oninput="handleItemNameInput(${item.id}, this.value)"
                            onfocus="handleItemNameInput(${item.id}, this.value)"
                            onblur="hideItemSuggestions(${item.id})"
                            onchange="updateLineItemName(${item.id}, this.value)"
                            style="width:100%;padding:6px 10px;border:1.5px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-input);font-size:0.875rem;font-weight:600;">
                        <div class="item-suggestions" id="item-suggestions-${item.id}"></div>
                    </div>
                    <button class="line-item-delete" onclick="removeLineItem(${item.id})" title="Remove item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
                <div class="line-item-fields">
                    <div class="form-group">
                        <label style="font-size:0.75rem;">Qty</label>
                        <input type="number" value="${item.qty}" min="0.01" step="0.01"
                            onchange="updateLineItem(${item.id}, 'qty', this.value)">
                    </div>
                    <div class="form-group">
                        <label style="font-size:0.75rem;">Price</label>
                        <input type="number" value="${item.price}" min="0" step="0.01"
                            onchange="updateLineItem(${item.id}, 'price', this.value)">
                    </div>
                    <div class="form-group">
                        <label style="font-size:0.75rem;">Disc. %</label>
                        <input type="number" value="${item.discount}" min="0" max="100" step="0.01"
                            onchange="updateLineItem(${item.id}, 'discount', this.value)">
                    </div>
                    <div class="form-group">
                        <label style="font-size:0.75rem;">Tax %</label>
                        <input type="number" value="${item.tax}" min="0" step="0.01"
                            onchange="updateLineItem(${item.id}, 'tax', this.value)">
                    </div>
                </div>
                <div class="line-item-total">
                    <span class="line-item-total-label">Total</span>
                    <span class="line-item-total-value" id="line-item-total-${item.id}">${formatCurrency(item.total)}</span>
                </div>
            </div>
            <div class="line-item-swipe-indicator" onclick="removeLineItem(${item.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
            </div>
        </div>
    `).join('');

    // Setup mobile swipe
    setupMobileSwipe();
}

// ===================== MOBILE SWIPE =====================
function setupMobileSwipe() {
    if (window.innerWidth > 640) return;

    $$('.line-item').forEach(item => {
        let startX = 0;
        let currentX = 0;
        let isSwiping = false;

        item.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isSwiping = true;
        }, { passive: true });

        item.addEventListener('touchmove', (e) => {
            if (!isSwiping) return;
            currentX = e.touches[0].clientX;
            const diff = startX - currentX;

            if (diff > 50) {
                item.classList.add('swiped');
            } else if (diff < -30) {
                item.classList.remove('swiped');
            }
        }, { passive: true });

        item.addEventListener('touchend', () => {
            isSwiping = false;
        }, { passive: true });
    });
}

// ===================== TOTALS =====================
function calculateTotals() {
    let billAmount = 0;
    let discountAmount = 0;
    let taxAmount = 0;

    AppState.lineItems.forEach(item => {
        billAmount += item.amountBeforeDiscount || 0;
        discountAmount += item.discountAmount || 0;
        taxAmount += item.taxAmount || 0;
    });

    const grandTotal = billAmount - discountAmount + taxAmount;

    $('#bill-amount').textContent = formatCurrency(billAmount);
    $('#discount-amount').textContent = '-' + formatCurrency(discountAmount);
    $('#tax-amount').textContent = '+' + formatCurrency(taxAmount);
    $('#grand-total').textContent = formatCurrency(grandTotal);

    // Auto-fill due amount if empty
    const dueAmountInput = $('#due-amount');
    if (dueAmountInput && !dueAmountInput.value) {
        dueAmountInput.value = grandTotal.toFixed(2);
    }

    return { billAmount, discountAmount, taxAmount, grandTotal };
}

// ===================== PAYMENT MODE =====================
function selectPaymentMode(mode) {
    AppState.paymentMode = mode;
    $$('.payment-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
}

// ===================== BILL GENERATION =====================
function getBillData() {
    const totals = calculateTotals();

    return {
        invoiceNo: $('#invoice-no').value,
        invoiceDate: $('#invoice-date').value,
        dueDate: $('#due-date')?.value || '',
        customerName: $('#customer-name').value,
        customerContact: $('#customer-contact')?.value || '',
        deliveryAddress: $('#delivery-address')?.value || '',
        lineItems: [...AppState.lineItems],
        billAmount: totals.billAmount,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        grandTotal: totals.grandTotal,
        paymentMode: AppState.paymentMode,
        notes: $('#bill-notes')?.value || '',
        companyData: { ...AppState.companyData },
        settings: { ...AppState.settings }
    };
}

// ===================== PRINT SETUP (fonts / paper size) =====================
const PRINT_WEIGHT_MAP = {
    normal: { base: 500, strong: 700 },
    bold:   { base: 700, strong: 800 },
    black:  { base: 800, strong: 900 }
};
const PRINT_SIZE_MAP = {
    '58mm': { maxWidth: 220, baseFont: 10 },
    '80mm': { maxWidth: 300, baseFont: 12 }
};

function getPrintConfig(overrides = {}) {
    const saved = AppState.settings.print || {};
    const fontWeightKey = overrides.fontWeight || saved.fontWeight || 'bold';
    const paperSizeKey = overrides.paperSize || saved.paperSize || '80mm';
    return {
        weights: PRINT_WEIGHT_MAP[fontWeightKey] || PRINT_WEIGHT_MAP.bold,
        size: PRINT_SIZE_MAP[paperSizeKey] || PRINT_SIZE_MAP['80mm']
    };
}

// Reads the (possibly unsaved) Print Setup selects on the Settings page,
// so Preview/Print Dummy Bill always reflects what's currently selected.
function getPrintSetupOverrides() {
    const fontWeight = $('#print-font-weight')?.value;
    const paperSize = $('#print-paper-size')?.value;
    return { fontWeight, paperSize };
}

function getDummyBillData() {
    const dummyItems = [
        { name: 'Sample Item A', qty: 2, price: 250, discount: 10, tax: 5 },
        { name: 'Sample Item B', qty: 1, price: 150, discount: 0, tax: 5 },
        { name: 'Sample Item C', qty: 3, price: 80, discount: 5, tax: 5 }
    ].map(d => {
        const item = { ...d };
        calculateLineItemTotal(item);
        return item;
    });

    const billAmount = dummyItems.reduce((s, i) => s + (i.amountBeforeDiscount || 0), 0);
    const discountAmount = dummyItems.reduce((s, i) => s + (i.discountAmount || 0), 0);
    const taxAmount = dummyItems.reduce((s, i) => s + (i.taxAmount || 0), 0);
    const grandTotal = billAmount - discountAmount + taxAmount;

    return {
        invoiceNo: 'SAMPLE-001',
        invoiceDate: new Date().toISOString().split('T')[0],
        customerName: 'Sample Customer',
        customerContact: '98765 43210',
        lineItems: dummyItems,
        billAmount, discountAmount, taxAmount, grandTotal,
        paymentMode: 'cash',
        notes: '',
        companyData: { ...AppState.companyData },
        settings: { ...AppState.settings }
    };
}

function previewDummyBill() {
    const billData = getDummyBillData();
    const printCfg = getPrintConfig(getPrintSetupOverrides());
    const previewContainer = $('#preview-bill-container');
    previewContainer.innerHTML = generatePOSBillHTML(billData, false, printCfg);
    $('#preview-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function printDummyBill() {
    const billData = getDummyBillData();
    const printCfg = getPrintConfig(getPrintSetupOverrides());
    printBill(billData, printCfg);
}

function generatePOSBillHTML(billData, forPrint = false, printConfigOverride = null) {
    const company = billData.companyData;
    const settings = billData.settings;
    const symbol = settings.currencySymbol || '₹';
    const printCfg = printConfigOverride || getPrintConfig();

    // Random thank you message
    const thankYouMsg = settings.thankYouMessages.length > 0 
        ? settings.thankYouMessages[Math.floor(Math.random() * settings.thankYouMessages.length)]
        : 'Thank you!';

    // Notes fallback
    let notes = billData.notes;
    if (!notes || notes.trim() === '') {
        notes = thankYouMsg;
    }

    const now = new Date();
    const dateStr = formatDate(billData.invoiceDate || now);
    const timeStr = formatTime(now);

    let logoHtml = '';
    if (company.logo) {
        logoHtml = `<img src="${company.logo}" class="pos-logo" alt="Logo" style="filter:grayscale(100%) contrast(1.15);">`;
    }

    let itemsHtml = billData.lineItems.map((item, idx) => {
        const discStr = item.discount > 0 ? `${item.discount}%` : '-';
        const taxStr = item.tax > 0 ? `${item.tax}%` : '-';
        return `
            <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(item.name) || 'Item'}</td>
                <td class="pos-td-center">${item.qty}</td>
                <td class="pos-td-right">${symbol}${item.price.toFixed(2)}</td>
                <td class="pos-td-center">${discStr}</td>
                <td class="pos-td-center">${taxStr}</td>
                <td class="pos-td-right">${symbol}${item.total.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    const totalQty = billData.lineItems.reduce((sum, item) => sum + (parseFloat(item.qty) || 0), 0);

    return `
        <div class="pos-bill" id="${forPrint ? 'print-bill' : ''}" style="--pw-base:${printCfg.weights.base};--pw-strong:${printCfg.weights.strong};--pw-size:${printCfg.size.baseFont}px;max-width:${printCfg.size.maxWidth}px;">
            <div class="pos-header">
                ${logoHtml}
                <div class="pos-company-name">${escapeHtml(company.name) || 'Your Company'}</div>
                ${company.gst ? `<div class="pos-gst">GSTIN: ${escapeHtml(company.gst)}</div>` : ''}
                ${company.address ? `<div class="pos-address">${escapeHtml(company.address).replace(/\n/g, '<br>')}</div>` : ''}
                ${company.phone ? `<div class="pos-contact">Ph: ${escapeHtml(company.phone)}</div>` : ''}
                ${company.email ? `<div class="pos-contact">${escapeHtml(company.email)}</div>` : ''}
            </div>

            <hr class="pos-divider">

            <div class="pos-meta">
                <span><span class="pos-meta-label">Bill No:</span> ${billData.invoiceNo || '---'}</span>
                <span><span class="pos-meta-label">Date:</span> ${dateStr}</span>
            </div>
            <div class="pos-meta">
                <span><span class="pos-meta-label">Time:</span> ${timeStr}</span>
            </div>

            <hr class="pos-divider">

            <div class="pos-customer">
                <div class="pos-customer-label">To: ${escapeHtml(billData.customerName) || 'Customer'}</div>
                ${billData.customerContact ? `<div style="font-size:9px;">Ph: ${escapeHtml(billData.customerContact)}</div>` : ''}
            </div>

            <table class="pos-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Item</th>
                        <th class="pos-td-center">Qty</th>
                        <th class="pos-td-right">Rate</th>
                        <th class="pos-td-center">Disc</th>
                        <th class="pos-td-center">Tax</th>
                        <th class="pos-td-right">Amt</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <hr class="pos-divider">

            <div style="font-size:9px;text-align:right;margin-bottom:4px;">Total Qty: ${totalQty}</div>

            <div class="pos-totals">
                <div class="pos-total-row">
                    <span>Bill Amount</span>
                    <span>${symbol}${billData.billAmount.toFixed(2)}</span>
                </div>
                <div class="pos-total-row">
                    <span>Item Discount</span>
                    <span>${symbol}${billData.discountAmount.toFixed(2)}</span>
                </div>
                <div class="pos-total-row">
                    <span>GST/Tax</span>
                    <span>${symbol}${billData.taxAmount.toFixed(2)}</span>
                </div>
                <div class="pos-total-row grand">
                    <span>Net Amount</span>
                    <span>${symbol}${billData.grandTotal.toFixed(2)}</span>
                </div>
            </div>

            ${billData.discountAmount > 0 ? `<div class="pos-saved">You have saved ${symbol}${billData.discountAmount.toFixed(2)}</div>` : ''}

            <div class="pos-payment">
                <span class="pos-meta-label">Payment Mode:</span> ${billData.paymentMode.toUpperCase()}
            </div>

            <hr class="pos-divider">

            <div class="pos-thankyou">${escapeHtml(thankYouMsg)}</div>

            ${settings.termsConditions ? `<div class="pos-terms">${escapeHtml(settings.termsConditions).replace(/\n/g, '<br>')}</div>` : ''}

            <div style="text-align:center;font-size:9px;font-weight:700;margin-top:6px;color:#444;">
                Powered by Bill-Hive
            </div>
        </div>
    `;
}

// ===================== ACTIONS =====================
function validateBill() {
    const customerName = $('#customer-name').value.trim();
    if (!customerName) {
        showToast('Please enter customer name');
        $('#customer-name').focus();
        return false;
    }

    if (AppState.lineItems.length === 0) {
        showToast('Please add at least one item');
        return false;
    }

    // Check all items have names.
    // v4.01.0 Task 6 fix: item.name in AppState only updates on the input's
    // onchange event, so if the user clicks Save before the field blurs, the
    // state is stale even though the input clearly has text in it. Read the
    // live DOM value instead (and sync it back into state) so validation
    // reflects what's actually on screen.
    for (const item of AppState.lineItems) {
        const nameInput = $(`#line-item-${item.id} .line-item-name`);
        const currentName = nameInput ? nameInput.value.trim() : (item.name || '').trim();
        if (!currentName) {
            showToast('Please enter item names for all line items');
            if (nameInput) nameInput.focus();
            return false;
        }
        item.name = currentName;
    }

    return true;
}

async function saveBill() {
    if (!validateBill()) return;

    const billData = getBillData();
    billData.id = Date.now();
    billData.createdAt = new Date().toISOString();

    AppState.savedBills.push(billData);
    await dbSet('bills', AppState.savedBills);

    // Decrement stock for catalog-linked, tracked items
    billData.lineItems.forEach(li => {
        if (li.itemId) {
            const catalogItem = AppState.items.find(it => it.id === li.itemId);
            if (catalogItem && catalogItem.trackStock !== false) {
                const qty = parseFloat(li.qty) || 0;
                catalogItem.stock = Math.max(0, catalogItem.stock - qty);
                logStockMovement(catalogItem.id, catalogItem.name, 'Sale', -qty, billData.invoiceNo);
            }
        }
    });
    await saveStockStorage();
    renderItemsTable();
    renderStockTable();

    showToast('Bill saved successfully!');
    resetBillFormForNext();
    return billData;
}

function resetBillFormForNext() {
    AppState.lineItems = [];
    lineItemIdCounter = 0;

    $('#customer-name').value = '';
    $('#customer-contact').value = '';
    $('#due-date').value = new Date().toISOString().split('T')[0];
    $('#due-amount').value = '';
    $('#delivery-address').value = '';
    $('#bill-notes').value = '';
    $('#invoice-no').value = generateInvoiceNumber();

    addLineItem();
}

async function saveAndPrint() {
    const billData = await saveBill();
    if (!billData) return;

    setTimeout(() => {
        printBill(billData);
    }, 300);
}

function printBill(billData, printConfigOverride = null) {
    const printWindow = window.open('', '_blank');
    const posHtml = generatePOSBillHTML(billData, true, printConfigOverride);

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Bill ${billData.invoiceNo}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Courier New', 'Consolas', monospace; 
                    font-weight: var(--pw-base, 700);
                    background: #fff; 
                    color: #000;
                    padding: 0;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    -webkit-font-smoothing: antialiased;
                }
                .pos-bill { 
                    max-width: 300px; 
                    margin: 0 auto; 
                    padding: 8px;
                    font-size: var(--pw-size, 12px);
                    font-weight: var(--pw-base, 700);
                    line-height: 1.45;
                }
                .pos-header { text-align: center; padding-bottom: 6px; border-bottom: 2px dashed #000; margin-bottom: 6px; }
                .pos-logo { width: 100%; max-width: 160px; height: auto; aspect-ratio: 4 / 1; object-fit: contain; margin: 0 auto 4px; display: block; }
                .pos-company-name { font-size: 14px; font-weight: var(--pw-strong, 800); }
                .pos-gst, .pos-address, .pos-contact { font-size: 11px; font-weight: var(--pw-base, 700); line-height: 1.35; }
                .pos-divider { border: none; border-top: 2px dashed #000; margin: 5px 0; }
                .pos-meta { display: flex; justify-content: space-between; font-size: 11px; font-weight: var(--pw-base, 700); margin-bottom: 2px; }
                .pos-meta-label { font-weight: var(--pw-strong, 800); }
                .pos-customer-label { font-weight: var(--pw-strong, 800); font-size: 11px; }
                .pos-table { width: 100%; border-collapse: collapse; font-size: 11px; font-weight: var(--pw-base, 700); margin: 4px 0; }
                .pos-table th { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 3px 2px; text-align: left; font-weight: var(--pw-strong, 800); }
                .pos-table td { padding: 2px 2px; vertical-align: top; font-weight: var(--pw-base, 700); }
                .pos-td-right { text-align: right; }
                .pos-td-center { text-align: center; }
                .pos-totals { border-top: 2px solid #000; padding-top: 3px; font-size: 11px; font-weight: var(--pw-base, 700); }
                .pos-total-row { display: flex; justify-content: space-between; margin-bottom: 1px; }
                .pos-total-row.grand { font-weight: var(--pw-strong, 800); font-size: 13px; border-top: 2px solid #000; padding-top: 3px; margin-top: 2px; }
                .pos-saved { text-align: center; font-size: 11px; font-weight: var(--pw-base, 700); margin: 4px 0; font-style: italic; }
                .pos-payment { font-size: 11px; font-weight: var(--pw-base, 700); margin: 3px 0; }
                .pos-thankyou { text-align: center; font-size: 12px; font-weight: var(--pw-strong, 800); margin: 4px 0; }
                .pos-terms { font-size: 10px; font-weight: var(--pw-base, 700); text-align: center; line-height: 1.35; margin-top: 3px; padding-top: 3px; border-top: 2px dashed #000; }
                @media print { body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            ${posHtml}
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                        setTimeout(function() { window.close(); }, 500);
                    }, 200);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function previewBill() {
    if (!validateBill()) return;

    const billData = getBillData();
    const previewContainer = $('#preview-bill-container');
    previewContainer.innerHTML = generatePOSBillHTML(billData);

    $('#preview-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePreview() {
    $('#preview-modal').classList.remove('active');
    document.body.style.overflow = '';
}

function printFromPreview() {
    const billData = getBillData();
    printBill(billData);
    closePreview();
}

async function clearBill() {
    if (AppState.lineItems.length > 0) {
        if (!await showConfirm('Clear this bill? All items will be removed.', 'Clear Bill')) {
            return;
        }
    }

    AppState.lineItems = [];
    lineItemIdCounter = 0;

    $('#customer-name').value = '';
    $('#customer-contact').value = '';
    $('#due-date').value = '';
    $('#due-amount').value = '';
    $('#delivery-address').value = '';
    $('#bill-notes').value = '';

    // Reset invoice number
    $('#invoice-no').value = generateInvoiceNumber();

    renderLineItems();
    calculateTotals();
    showToast('Bill cleared');
}

// ===================== COMPANY DATA =====================
function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showToast('Logo must be under 2MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        AppState.companyData.logo = dataUrl;

        // Show preview
        const preview = $('#company-logo-preview');
        preview.src = dataUrl;
        preview.style.display = 'block';

        // Update header logo
        updateHeaderLogo(dataUrl);

        showToast('Logo uploaded');
    };
    reader.readAsDataURL(file);
}

function updateHeaderLogo(logoUrl) {
    const headerImg = $('#header-logo');
    const headerPlaceholder = $('#header-logo-placeholder');

    if (logoUrl) {
        headerImg.src = logoUrl;
        headerImg.style.display = 'block';
        headerPlaceholder.style.display = 'none';
    } else {
        headerImg.style.display = 'none';
        headerPlaceholder.style.display = 'flex';
    }
}

async function saveCompanyData() {
    AppState.companyData.name = $('#company-name').value;
    AppState.companyData.gst = $('#company-gst').value;
    AppState.companyData.address = $('#company-address').value;
    AppState.companyData.phone = $('#company-phone').value;
    AppState.companyData.email = $('#company-email').value;

    await dbSet('company', AppState.companyData);
    renderYourDataView();
    exitYourDataEdit();
    showToast('Company data saved!');
}

// ===================== YOUR DATA: VIEW / EDIT TOGGLE =====================
function renderYourDataView() {
    const d = AppState.companyData;
    const setVal = (id, val) => { const el = $(id); if (el) el.textContent = (val && String(val).trim()) ? val : '—'; };
    setVal('#view-company-name', d.name);
    setVal('#view-company-gst', d.gst);
    setVal('#view-company-address', d.address);
    setVal('#view-company-phone', d.phone);
    setVal('#view-company-email', d.email);

    const img = $('#view-company-logo');
    const placeholder = $('#view-company-logo-placeholder');
    if (img && placeholder) {
        if (d.logo) {
            img.src = d.logo;
            img.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            img.style.display = 'none';
            placeholder.style.display = 'flex';
        }
    }
}

function enterYourDataEdit() {
    const view = $('#your-data-view');
    const edit = $('#your-data-edit');
    if (view) view.style.display = 'none';
    if (edit) edit.style.display = 'flex';
}

function exitYourDataEdit() {
    const view = $('#your-data-view');
    const edit = $('#your-data-edit');
    if (edit) edit.style.display = 'none';
    if (view) view.style.display = 'flex';
}

async function loadCompanyData() {
    const data = await dbGet('company');
    if (data) {
        try {
            AppState.companyData = { ...AppState.companyData, ...data };

            $('#company-name').value = data.name || '';
            $('#company-gst').value = data.gst || '';
            $('#company-address').value = data.address || '';
            $('#company-phone').value = data.phone || '';
            $('#company-email').value = data.email || '';

            if (data.logo) {
                const preview = $('#company-logo-preview');
                preview.src = data.logo;
                preview.style.display = 'block';
                updateHeaderLogo(data.logo);
            }
        } catch (e) {
            console.error('Error loading company data:', e);
        }
    }
    renderYourDataView();
}

// ===================== SETTINGS =====================
function addThankYouMessage() {
    const container = $('#thank-you-messages');
    const div = document.createElement('div');
    div.className = 'settings-item';
    div.innerHTML = `
        <input type="text" value="" placeholder="Enter thank you message" class="settings-input">
        <button class="settings-remove" onclick="removeSettingItem(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;
    container.appendChild(div);
}

function removeSettingItem(btn) {
    const item = btn.closest('.settings-item');
    if (item) item.remove();
}

async function saveSettings() {
    // Collect thank you messages
    const messages = [];
    $$('#thank-you-messages .settings-input').forEach(input => {
        if (input.value.trim()) {
            messages.push(input.value.trim());
        }
    });
    AppState.settings.thankYouMessages = messages.length > 0 ? messages : ['Thank you!'];

    // Terms
    AppState.settings.termsConditions = $('#terms-conditions').value;

    // Currency
    AppState.settings.currencySymbol = $('#currency-symbol').value || '₹';

    // Print setup
    AppState.settings.print = {
        fontWeight: $('#print-font-weight')?.value || 'bold',
        paperSize: $('#print-paper-size')?.value || '80mm'
    };

    await dbSet('settings', AppState.settings);
    showToast('Settings saved!');
}

async function loadSettings() {
    const data = await dbGet('settings');
    if (data) {
        try {
            AppState.settings = { ...AppState.settings, ...data };

            // Rebuild thank you messages
            const container = $('#thank-you-messages');
            if (data.thankYouMessages && data.thankYouMessages.length > 0) {
                container.innerHTML = data.thankYouMessages.map(msg => `
                    <div class="settings-item">
                        <input type="text" value="${msg}" class="settings-input">
                        <button class="settings-remove" onclick="removeSettingItem(this)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                `).join('');
            }

            $('#terms-conditions').value = data.termsConditions || '';
            $('#currency-symbol').value = data.currencySymbol || '₹';

            const printCfg = data.print || {};
            if ($('#print-font-weight')) $('#print-font-weight').value = printCfg.fontWeight || 'bold';
            if ($('#print-paper-size')) $('#print-paper-size').value = printCfg.paperSize || '80mm';
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }
}

// ===================== ITEMS CATALOG =====================
function renderItemsDatalist() {
    const dl = $('#items-datalist');
    if (!dl) return;
    dl.innerHTML = AppState.items.map(it => `<option value="${escapeHtml(it.name)}">`).join('');
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function updateLineItemName(id, value) {
    const item = AppState.lineItems.find(i => i.id === id);
    if (!item) return;

    item.name = value;
    const match = AppState.items.find(it => it.name.toLowerCase() === value.trim().toLowerCase());

    if (match) {
        item.itemId = match.id;
        item.price = match.price;
        item.discount = match.discount;
        item.tax = match.tax;
        calculateLineItemTotal(item);
        renderLineItems();
        calculateTotals();
    } else {
        item.itemId = null;
        calculateLineItemTotal(item);
        calculateTotals();
    }
}

// ---- Custom item-name search dropdown (replaces the native <datalist>,
// which renders inconsistently — or not at all — across browsers/themes) ----
function handleItemNameInput(id, value) {
    const item = AppState.lineItems.find(i => i.id === id);
    if (item) item.name = value;

    const box = $(`#item-suggestions-${id}`);
    if (!box) return;

    const query = (value || '').trim().toLowerCase();
    const matches = (query
        ? AppState.items.filter(it => it.name.toLowerCase().includes(query))
        : AppState.items
    ).slice(0, 8);

    if (AppState.items.length === 0) {
        box.classList.remove('show');
        box.innerHTML = '';
        return;
    }

    if (matches.length === 0) {
        box.innerHTML = `<div class="item-suggestion-empty">No matching items — will be saved as a custom item</div>`;
        box.classList.add('show');
        return;
    }

    box.innerHTML = matches.map(it => `
        <div class="item-suggestion-row" onmousedown="selectItemSuggestion(${id}, ${it.id})">
            <span class="item-suggestion-name">${escapeHtml(it.name)}</span>
            <span class="item-suggestion-price">${formatCurrency(it.price)}</span>
        </div>
    `).join('');
    box.classList.add('show');
}

function selectItemSuggestion(lineId, catalogId) {
    const catalogItem = AppState.items.find(it => it.id === catalogId);
    if (!catalogItem) return;
    updateLineItemName(lineId, catalogItem.name);
}

function hideItemSuggestions(id) {
    setTimeout(() => {
        const box = $(`#item-suggestions-${id}`);
        if (box) box.classList.remove('show');
    }, 150);
}

async function saveItemsStorage() {
    await dbSet('items', AppState.items);
    renderItemsDatalist();
}

async function loadItems() {
    const data = await dbGet('items');
    if (data) {
        try {
            AppState.items = data;
            const maxId = AppState.items.reduce((m, it) => Math.max(m, it.id), 0);
            itemIdCounter = maxId;
        } catch (e) { console.error('Error loading items:', e); }
    }
    renderItemsDatalist();
}

// ===================== EXCEL IMPORT / EXPORT (ITEMS) =====================
const ITEMS_TEMPLATE_COLUMNS = [
    'Name', 'SKU', 'EAN', 'Item Number', 'Brand',
    'Cost', 'Price', 'Discount %', 'Tax %', 'Opening Stock', 'Track Stock (Y/N)'
];

function downloadItemsTemplate() {
    if (typeof XLSX === 'undefined') {
        showToast('Excel library still loading — try again in a moment');
        return;
    }
    const sampleRows = [
        { 'Name': 'Cotton T-Shirt', 'SKU': 'TS-001', 'EAN': '8901234567890', 'Item Number': 'IN-1001', 'Brand': 'Northline Apparel', 'Cost': 250, 'Price': 499, 'Discount %': 10, 'Tax %': 5, 'Opening Stock': 40, 'Track Stock (Y/N)': 'Y' },
        { 'Name': 'Leather Wallet', 'SKU': 'WL-014', 'EAN': '8901234567891', 'Item Number': 'IN-1002', 'Brand': 'Craftline', 'Cost': 300, 'Price': 799, 'Discount %': 0, 'Tax %': 12, 'Opening Stock': 15, 'Track Stock (Y/N)': 'Y' },
        { 'Name': 'Consulting Service', 'SKU': '', 'EAN': '', 'Item Number': '', 'Brand': '', 'Cost': 0, 'Price': 1500, 'Discount %': 0, 'Tax %': 18, 'Opening Stock': 0, 'Track Stock (Y/N)': 'N' }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows, { header: ITEMS_TEMPLATE_COLUMNS });
    ws['!cols'] = ITEMS_TEMPLATE_COLUMNS.map(c => ({ wch: Math.max(c.length + 2, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, 'billhive-items-template.xlsx');
}

// ===================== EXCEL IMPORT PREVIEW (v4.01.0) =====================
// Module-level array holds rows parsed from Excel, waiting for user review.
let excelPreviewData = []; // [{ included, name, sku, ean, itemNumber, brand, cost, price, discount, tax, stock, trackStock }]

function importItemsFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
        showToast('Excel library still loading — try again in a moment');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });

            if (rows.length === 0) {
                showToast('No rows found in that file');
                event.target.value = '';
                return;
            }

            // Parse rows into preview objects — skip rows with no name
            excelPreviewData = [];
            let skippedCount = 0;

            rows.forEach(row => {
                const get = (...keys) => {
                    for (const k of keys) {
                        if (row[k] !== undefined && row[k] !== '') return row[k];
                    }
                    return '';
                };

                const name = String(get('Name', 'name', 'Item Name') || '').trim();
                if (!name) { skippedCount++; return; }

                const trackStockRaw = String(get('Track Stock (Y/N)', 'Track Stock', 'trackStock') || 'Y').trim().toLowerCase();
                const trackStock = !(trackStockRaw === 'n' || trackStockRaw === 'no' || trackStockRaw === 'false' || trackStockRaw === '0');

                excelPreviewData.push({
                    included: true,
                    name,
                    sku:        String(get('SKU', 'sku') || '').trim(),
                    ean:        String(get('EAN', 'ean') || '').trim(),
                    itemNumber: String(get('Item Number', 'itemNumber') || '').trim(),
                    brand:      String(get('Brand', 'brand') || '').trim(),
                    cost:       parseFloat(get('Cost', 'cost')) || 0,
                    price:      parseFloat(get('Price', 'price')) || 0,
                    discount:   parseFloat(get('Discount %', 'Discount', 'discount')) || 0,
                    tax:        parseFloat(get('Tax %', 'Tax', 'tax')) || 0,
                    stock:      parseFloat(get('Opening Stock', 'Stock', 'stock')) || 0,
                    trackStock
                });
            });

            if (excelPreviewData.length === 0) {
                showToast(`No valid rows found (${skippedCount} skipped — missing name)`);
                event.target.value = '';
                return;
            }

            if (skippedCount > 0) {
                showToast(`${skippedCount} row${skippedCount === 1 ? '' : 's'} skipped (missing name) — review remaining rows below`);
            }

            openExcelPreviewModal();
        } catch (err) {
            console.error('Excel import error:', err);
            showToast('Could not read that file — check it matches the template');
        }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

function openExcelPreviewModal() {
    renderExcelPreview();
    $('#excel-preview-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeExcelPreviewModal() {
    $('#excel-preview-modal').classList.remove('active');
    document.body.style.overflow = '';
    excelPreviewData = [];
}

function renderExcelPreview() {
    const tbody = $('#excel-preview-table-body');
    const countEl = $('#excel-preview-count');
    if (!tbody) return;

    const includedCount = excelPreviewData.filter(r => r.included).length;

    tbody.innerHTML = excelPreviewData.map((row, idx) => `
        <tr id="excel-preview-row-${idx}" style="opacity:${row.included ? '1' : '0.4'};">
            <td>
                <input type="checkbox" ${row.included ? 'checked' : ''}
                    onchange="toggleExcelPreviewRow(${idx}, this.checked)">
            </td>
            <td class="cell-strong" id="epv-name-${idx}">${escapeHtml(row.name)}</td>
            <td id="epv-sku-${idx}">${escapeHtml(row.sku || '—')}</td>
            <td id="epv-brand-${idx}">${escapeHtml(row.brand || '—')}</td>
            <td id="epv-price-${idx}">${row.price}</td>
            <td id="epv-cost-${idx}">${row.cost}</td>
            <td id="epv-stock-${idx}">${row.stock}</td>
            <td id="epv-track-${idx}">${row.trackStock ? 'Y' : 'N'}</td>
            <td class="cell-actions">
                <button class="icon-btn" onclick="editExcelPreviewRow(${idx})" title="Edit row">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                </button>
                <button class="icon-btn icon-btn-danger" onclick="removeExcelPreviewRow(${idx})" title="Remove row">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="9" class="cell-muted" style="text-align:center;">No rows to preview</td></tr>';

    // Keep the select-all checkbox in sync
    const selectAll = $('#excel-preview-select-all');
    if (selectAll && excelPreviewData.length > 0) {
        selectAll.checked = excelPreviewData.every(r => r.included);
        selectAll.indeterminate = !selectAll.checked && excelPreviewData.some(r => r.included);
    }

    if (countEl) {
        countEl.textContent = `${includedCount} of ${excelPreviewData.length} rows selected for import`;
    }
}

function toggleExcelPreviewSelectAll(checkbox) {
    excelPreviewData.forEach(row => { row.included = checkbox.checked; });
    renderExcelPreview();
}

function toggleExcelPreviewRow(index, checked) {
    if (excelPreviewData[index] === undefined) return;
    excelPreviewData[index].included = checked;
    // Update row opacity inline without full re-render
    const row = $(`#excel-preview-row-${index}`);
    if (row) row.style.opacity = checked ? '1' : '0.4';
    // Re-sync select-all and count
    const includedCount = excelPreviewData.filter(r => r.included).length;
    const countEl = $('#excel-preview-count');
    if (countEl) countEl.textContent = `${includedCount} of ${excelPreviewData.length} rows selected for import`;
    const selectAll = $('#excel-preview-select-all');
    if (selectAll) {
        selectAll.checked = excelPreviewData.every(r => r.included);
        selectAll.indeterminate = !selectAll.checked && excelPreviewData.some(r => r.included);
    }
}

function removeExcelPreviewRow(index) {
    excelPreviewData.splice(index, 1);
    renderExcelPreview();
}

function editExcelPreviewRow(index) {
    const row = excelPreviewData[index];
    if (!row) return;

    // Swap display cells for inputs
    const fields = [
        ['name',  'epv-name-'  + index, 'text'],
        ['sku',   'epv-sku-'   + index, 'text'],
        ['brand', 'epv-brand-' + index, 'text'],
        ['price', 'epv-price-' + index, 'number'],
        ['cost',  'epv-cost-'  + index, 'number'],
        ['stock', 'epv-stock-' + index, 'number'],
    ];

    fields.forEach(([field, cellId, inputType]) => {
        const cell = document.getElementById(cellId);
        if (!cell) return;
        const currentVal = field === 'name' || field === 'sku' || field === 'brand'
            ? (row[field] || '')
            : row[field];
        cell.innerHTML = `<input type="${inputType}" value="${escapeHtml(String(currentVal))}"
            style="width:100%;min-width:60px;padding:3px 6px;border:1.5px solid var(--border-focus);border-radius:var(--radius-sm);background:var(--bg-input);font-size:0.8125rem;"
            data-field="${field}" data-index="${index}">`;
    });

    // Track cell: swap for a checkbox
    const trackCell = document.getElementById('epv-track-' + index);
    if (trackCell) {
        trackCell.innerHTML = `<input type="checkbox" ${row.trackStock ? 'checked' : ''}
            data-field="trackStock" data-index="${index}">`;
    }

    // Swap action buttons to Save / Cancel
    const actionCell = $(`#excel-preview-row-${index} .cell-actions`);
    if (actionCell) {
        actionCell.innerHTML = `
            <button class="icon-btn" onclick="saveExcelPreviewEdit(${index})" title="Save">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </button>
            <button class="icon-btn" onclick="renderExcelPreview()" title="Cancel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>`;
    }
}

function saveExcelPreviewEdit(index) {
    const row = excelPreviewData[index];
    if (!row) return;

    // Read text/number inputs
    const textFields = ['name', 'sku', 'brand'];
    const numFields  = ['price', 'cost', 'stock'];

    textFields.forEach(field => {
        const input = $(`#excel-preview-row-${index} input[data-field="${field}"]`);
        if (input) row[field] = input.value.trim();
    });
    numFields.forEach(field => {
        const input = $(`#excel-preview-row-${index} input[data-field="${field}"]`);
        if (input) row[field] = parseFloat(input.value) || 0;
    });

    // trackStock checkbox
    const trackInput = $(`#excel-preview-row-${index} input[data-field="trackStock"]`);
    if (trackInput) row.trackStock = trackInput.checked;

    // Require name
    if (!row.name) {
        showToast('Item name cannot be empty');
        return;
    }

    renderExcelPreview();
}

async function confirmExcelImport() {
    const toImport = excelPreviewData.filter(r => r.included);
    if (toImport.length === 0) {
        showToast('No rows selected — check at least one row to import');
        return;
    }

    // Load existing brands so we can auto-create any new ones
    let brands = [];
    try {
        const saved = await dbGet('brands');
        brands = saved || [];
    } catch (err) { brands = []; }
    let brandIdCounter = brands.reduce((max, b) => Math.max(max, b.id || 0), 0);
    const existingBrandNames = new Set(brands.map(b => b.name.toLowerCase()));

    let newBrandCount = 0;

    toImport.forEach(row => {
        itemIdCounter++;
        AppState.items.push({
            id:         itemIdCounter,
            name:       row.name,
            sku:        row.sku        || '',
            ean:        row.ean        || '',
            itemNumber: row.itemNumber || '',
            brand:      row.brand      || '',
            cost:       row.cost       || 0,
            price:      row.price      || 0,
            discount:   row.discount   || 0,
            tax:        row.tax        || 0,
            stock:      row.stock      || 0,
            trackStock: row.trackStock
        });

        if (row.brand && !existingBrandNames.has(row.brand.toLowerCase())) {
            brandIdCounter++;
            brands.push({ id: brandIdCounter, name: row.brand, description: '', logo: '' });
            existingBrandNames.add(row.brand.toLowerCase());
            newBrandCount++;
        }
    });

    await saveItemsStorage();
    renderItemsTable();
    renderStockTable();
    await dbSet('brands', brands);

    let msg = `Imported ${toImport.length} item${toImport.length === 1 ? '' : 's'}`;
    if (newBrandCount > 0) msg += `, created ${newBrandCount} new brand${newBrandCount === 1 ? '' : 's'}`;
    showToast(msg);

    closeExcelPreviewModal();
}

// Warn user if they try to navigate away while the preview modal is open
window.addEventListener('beforeunload', (e) => {
    if ($('#excel-preview-modal')?.classList.contains('active')) {
        e.preventDefault();
        e.returnValue = 'You have unsaved import data. Are you sure you want to leave?';
    }
});

async function openItemModal(id = null) {
    editingItemId = id;
    const modalTitle = $('#item-modal-title');
    if (id) {
        const item = AppState.items.find(i => i.id === id);
        if (!item) return;
        modalTitle.textContent = 'Edit Item';
        $('#item-form-name').value = item.name;
        $('#item-form-price').value = item.price;
        $('#item-form-discount').value = item.discount;
        $('#item-form-tax').value = item.tax;
        $('#item-form-stock').value = item.stock;
        $('#item-form-track-stock').checked = item.trackStock !== false;
    } else {
        modalTitle.textContent = 'Add Item';
        $('#item-form-name').value = '';
        $('#item-form-price').value = '';
        $('#item-form-discount').value = '';
        $('#item-form-tax').value = '';
        $('#item-form-stock').value = '';
        $('#item-form-track-stock').checked = true;
    }
    await populateBrandsDatalist();
    $('#item-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeItemModal() {
    $('#item-modal').classList.remove('active');
    document.body.style.overflow = '';
    editingItemId = null;
}

async function saveItemForm() {
    const name = $('#item-form-name').value.trim();
    if (!name) {
        showToast('Please enter an item name');
        return;
    }

    const data = {
        name,
        sku: $('#item-form-sku').value.trim(),
        ean: $('#item-form-ean').value.trim(),
        itemNumber: $('#item-form-itemno').value.trim(),
        brand: $('#item-form-brand').value.trim(),
        cost: parseFloat($('#item-form-cost').value) || 0,
        price: parseFloat($('#item-form-price').value) || 0,
        discount: parseFloat($('#item-form-discount').value) || 0,
        tax: parseFloat($('#item-form-tax').value) || 0,
        stock: parseFloat($('#item-form-stock').value) || 0,
        trackStock: $('#item-form-track-stock').checked
    };

    if (editingItemId) {
        const item = AppState.items.find(i => i.id === editingItemId);
        if (item) Object.assign(item, data);
        showToast('Item updated');
    } else {
        itemIdCounter++;
        AppState.items.push({ id: itemIdCounter, ...data });
        showToast('Item added');
    }

    await saveItemsStorage();
    closeItemModal();
    renderItemsTable();
    renderStockTable();
}

async function deleteItem(id) {
    if (!await showConfirm('Delete this item? This will not affect past bills.', 'Delete Item')) return;
    AppState.items = AppState.items.filter(i => i.id !== id);
    await saveItemsStorage();
    renderItemsTable();
    renderStockTable();
    showToast('Item deleted');
}

function renderItemsTable() {
    const tbody = $('#items-table-body');
    if (!tbody) return;
    const query = ($('#items-search')?.value || '').toLowerCase().trim();
    const list = AppState.items.filter(it => it.name.toLowerCase().includes(query));

    $('#items-empty').style.display = AppState.items.length === 0 ? 'flex' : 'none';

    tbody.innerHTML = list.map(it => `
        <tr>
            <td class="cell-strong">${escapeHtml(it.name)}</td>
            <td class="cell-muted">${escapeHtml(it.sku || '—')}</td>
            <td class="cell-muted">${escapeHtml(it.brand || '—')}</td>
            <td>${formatCurrency(it.price)}</td>
            <td class="cell-muted">${it.cost ? formatCurrency(it.cost) : '—'}</td>
            <td>${it.discount}%</td>
            <td>${it.tax}%</td>
            <td>${it.trackStock !== false ? it.stock : '—'}</td>
            <td class="cell-actions">
                <button class="icon-btn" onclick="openItemModal(${it.id})" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="icon-btn icon-btn-danger" onclick="deleteItem(${it.id})" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
            </td>
        </tr>
    `).join('');
    initColumnVisibility('items-table');
}

// ===================== STOCK =====================
let stockAdjustItemId = null;

async function saveStockStorage() {
    await saveItemsStorage();
    await dbSet('stocklog', AppState.stockLog);
}

async function loadStockLog() {
    const data = await dbGet('stocklog');
    if (data) {
        try { AppState.stockLog = data; } catch (e) {}
    }
}

function logStockMovement(itemId, itemName, type, qty, reference) {
    AppState.stockLog.unshift({
        id: Date.now() + Math.random(),
        date: new Date().toISOString(),
        itemId, itemName, type, qty, reference: reference || '-'
    });
    AppState.stockLog = AppState.stockLog.slice(0, 200);
}

function renderStockTable() {
    const tbody = $('#stock-table-body');
    if (!tbody) return;
    $('#stock-empty').style.display = AppState.items.length === 0 ? 'flex' : 'none';

    tbody.innerHTML = AppState.items.map(it => {
        const tracked = it.trackStock !== false;
        const low = tracked && it.stock <= 5;
        return `
        <tr>
            <td class="cell-strong">${escapeHtml(it.name)}</td>
            <td>${tracked ? 'Tracked' : 'Not tracked'}</td>
            <td>${tracked ? it.stock : '—'}</td>
            <td>${tracked ? `<span class="status-pill ${low ? 'status-low' : 'status-ok'}">${low ? 'Low Stock' : 'In Stock'}</span>` : '<span class="status-pill">N/A</span>'}</td>
            <td class="cell-actions">
                <button class="icon-btn" onclick="openStockModal(${it.id})" title="Adjust" ${!tracked ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
            </td>
        </tr>`;
    }).join('');

    const logBody = $('#stock-log-body');
    if (logBody) {
        logBody.innerHTML = AppState.stockLog.slice(0, 25).map(log => `
            <tr>
                <td>${formatDate(log.date)}</td>
                <td>${escapeHtml(log.itemName)}</td>
                <td>${log.type}</td>
                <td class="${log.qty < 0 ? 'discount' : ''}">${log.qty > 0 ? '+' : ''}${log.qty}</td>
                <td>${escapeHtml(log.reference)}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="cell-muted">No stock movements yet</td></tr>';
    }
    initColumnVisibility('stock-table');
}

function openStockModal(id) {
    const item = AppState.items.find(i => i.id === id);
    if (!item) return;
    stockAdjustItemId = id;
    $('#stock-modal-item-label').textContent = `Item: ${item.name} (Current stock: ${item.stock})`;
    $('#stock-adjust-type').value = 'add';
    $('#stock-adjust-qty').value = '';
    $('#stock-adjust-note').value = '';
    $('#stock-adjust-no-inventory').checked = false;
    $('#stock-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeStockModal() {
    $('#stock-modal').classList.remove('active');
    document.body.style.overflow = '';
    stockAdjustItemId = null;
}

async function applyStockAdjustment() {
    const item = AppState.items.find(i => i.id === stockAdjustItemId);
    if (!item) return;

    const type = $('#stock-adjust-type').value;
    const qty = parseFloat($('#stock-adjust-qty').value) || 0;
    const note = $('#stock-adjust-note').value.trim();
    const noInventory = $('#stock-adjust-no-inventory').checked;

    if (qty <= 0 && type !== 'set') {
        showToast('Enter a quantity greater than 0');
        return;
    }

    if (noInventory) {
        // Record as damaged stock for the audit trail without touching the stock count
        logStockMovement(item.id, item.name, 'Damaged (not added to inventory)', -Math.abs(qty), note || 'Damaged stock');
        await saveStockStorage();
        renderStockTable();
        closeStockModal();
        showToast('Damaged stock logged');
        return;
    }

    let delta = 0;
    if (type === 'add') { item.stock += qty; delta = qty; }
    else if (type === 'remove') { item.stock = Math.max(0, item.stock - qty); delta = -qty; }
    else if (type === 'set') { delta = qty - item.stock; item.stock = qty; }

    logStockMovement(item.id, item.name, type === 'set' ? 'Adjustment (set)' : (type === 'add' ? 'Manual Add' : 'Manual Remove'), delta, note || 'Manual adjustment');

    await saveStockStorage();
    renderStockTable();
    closeStockModal();
    showToast('Stock updated');
}

// ===================== PAST BILLS =====================
function renderPastBills() {
    const tbody = $('#past-bills-body');
    if (!tbody) return;
    const query = ($('#bills-search')?.value || '').toLowerCase().trim();

    const list = [...AppState.savedBills].reverse().filter(b =>
        !query || (b.customerName || '').toLowerCase().includes(query) || (b.invoiceNo || '').toLowerCase().includes(query)
    );

    $('#past-bills-empty').style.display = AppState.savedBills.length === 0 ? 'flex' : 'none';

    tbody.innerHTML = list.map(b => `
        <tr>
            <td class="cell-strong">${b.invoiceNo}</td>
            <td>${formatDate(b.invoiceDate)}</td>
            <td>${escapeHtml(b.customerName)}</td>
            <td>${formatCurrency(b.grandTotal)}</td>
            <td><span class="status-pill status-ok">${b.paymentMode.toUpperCase()}</span></td>
            <td class="cell-actions">
                <button class="icon-btn" onclick="viewPastBill(${b.id})" title="Preview">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button class="icon-btn" onclick="reprintPastBill(${b.id})" title="Print">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                </button>
                <button class="icon-btn icon-btn-danger" onclick="deletePastBill(${b.id})" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
            </td>
        </tr>
    `).join('');
    initColumnVisibility('past-bills-table');
}

function findBill(id) {
    return AppState.savedBills.find(b => b.id === id);
}

function viewPastBill(id) {
    const bill = findBill(id);
    if (!bill) return;
    const previewContainer = $('#preview-bill-container');
    previewContainer.innerHTML = generatePOSBillHTML(bill);
    $('#preview-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    $('#preview-modal').dataset.billId = id;
}

function reprintPastBill(id) {
    const bill = findBill(id);
    if (!bill) return;
    printBill(bill);
}

async function deletePastBill(id) {
    if (!await showConfirm('Delete this bill permanently? This cannot be undone.', 'Delete Bill')) return;
    AppState.savedBills = AppState.savedBills.filter(b => b.id !== id);
    await dbSet('bills', AppState.savedBills);
    renderPastBills();
    showToast('Bill deleted');
}

// ===================== SALES RETURN =====================
function getReturnedQtyMap(billId) {
    const map = {};
    AppState.salesReturns.filter(r => r.billId === billId).forEach(r => {
        r.items.forEach(i => {
            map[i.name] = (map[i.name] || 0) + (parseFloat(i.qty) || 0);
        });
    });
    return map;
}

function isBillFullyReturned(bill) {
    const map = getReturnedQtyMap(bill.id);
    return bill.lineItems.every(item => (map[item.name] || 0) >= (parseFloat(item.qty) || 0) - 1e-9);
}

function populateReturnBillSelect() {
    const select = $('#return-bill-select');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">-- Select an invoice --</option>' +
        [...AppState.savedBills].reverse()
            .filter(b => !isBillFullyReturned(b))
            .map(b => `<option value="${b.id}">${b.invoiceNo} — ${escapeHtml(b.customerName)} — ${formatCurrency(b.grandTotal)}</option>`).join('');
    select.value = current;
}

function loadBillForReturn() {
    const id = parseFloat($('#return-bill-select').value);
    const container = $('#return-items-container');
    const summary = $('#return-summary');

    if (!id) {
        container.innerHTML = '';
        summary.style.display = 'none';
        return;
    }

    const bill = findBill(id);
    if (!bill) return;

    const returnedMap = getReturnedQtyMap(bill.id);
    const rows = bill.lineItems.map((item, idx) => {
        const alreadyReturned = returnedMap[item.name] || 0;
        const remaining = Math.max(0, (parseFloat(item.qty) || 0) - alreadyReturned);
        return { item, idx, remaining };
    }).filter(r => r.remaining > 0);

    if (rows.length === 0) {
        container.innerHTML = '';
        summary.style.display = 'none';
        showToast('All items on this invoice have already been returned');
        populateReturnBillSelect();
        $('#return-bill-select').value = '';
        return;
    }

    container.innerHTML = `
        <div class="table-wrap">
            <table class="data-table">
                <thead><tr><th>Return</th><th>Item</th><th>Remaining Qty</th><th>Return Qty</th><th>Amount</th></tr></thead>
                <tbody>
                    ${rows.map(({ item, idx, remaining }) => `
                        <tr>
                            <td><input type="checkbox" class="return-item-check" data-idx="${idx}" onchange="calculateReturnAmount()"></td>
                            <td>${escapeHtml(item.name)}</td>
                            <td>${remaining}</td>
                            <td><input type="number" class="return-item-qty" data-idx="${idx}" min="0" max="${remaining}" value="${remaining}" step="0.01" oninput="calculateReturnAmount()" style="width:70px;padding:4px 8px;border:1.5px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-input);"></td>
                            <td>${formatCurrency(item.total)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    summary.style.display = 'block';
    calculateReturnAmount();
}

function calculateReturnAmount() {
    const id = parseFloat($('#return-bill-select').value);
    const bill = findBill(id);
    if (!bill) return;

    let refund = 0;
    $$('.return-item-check').forEach(chk => {
        if (chk.checked) {
            const idx = parseInt(chk.dataset.idx);
            const item = bill.lineItems[idx];
            const qtyInput = $(`.return-item-qty[data-idx="${idx}"]`);
            const returnQty = Math.min(parseFloat(qtyInput.value) || 0, parseFloat(qtyInput.max) || item.qty);
            const perUnit = item.total / (parseFloat(item.qty) || 1);
            refund += perUnit * returnQty;
        }
    });

    $('#return-refund-amount').textContent = formatCurrency(refund);
}

async function processSalesReturn() {
    const id = parseFloat($('#return-bill-select').value);
    const bill = findBill(id);
    if (!bill) return;

    const checks = $$('.return-item-check');
    const returnedItems = [];
    let refund = 0;

    checks.forEach(chk => {
        if (chk.checked) {
            const idx = parseInt(chk.dataset.idx);
            const item = bill.lineItems[idx];
            const qtyInput = $(`.return-item-qty[data-idx="${idx}"]`);
            const returnQty = Math.min(parseFloat(qtyInput.value) || 0, parseFloat(qtyInput.max) || item.qty);
            if (returnQty <= 0) return;

            const perUnit = item.total / (parseFloat(item.qty) || 1);
            const amount = perUnit * returnQty;
            refund += amount;
            returnedItems.push({ name: item.name, qty: returnQty, amount, itemId: item.itemId || null });

            // restock
            if (item.itemId) {
                const catalogItem = AppState.items.find(it => it.id === item.itemId);
                if (catalogItem && catalogItem.trackStock !== false) {
                    catalogItem.stock += returnQty;
                    logStockMovement(catalogItem.id, catalogItem.name, 'Sales Return', returnQty, bill.invoiceNo);
                }
            }
        }
    });

    if (returnedItems.length === 0) {
        showToast('Select at least one item to return');
        return;
    }

    const returnRecord = {
        id: Date.now(),
        date: new Date().toISOString(),
        billId: bill.id,
        invoiceNo: bill.invoiceNo,
        customerName: bill.customerName,
        items: returnedItems,
        refundAmount: refund,
        reason: $('#return-reason').value.trim()
    };

    AppState.salesReturns.push(returnRecord);
    await dbSet('returns', AppState.salesReturns);
    await saveStockStorage();

    showToast(`Return processed — refund ${formatCurrency(refund)}`);
    $('#return-bill-select').value = '';
    $('#return-items-container').innerHTML = '';
    $('#return-summary').style.display = 'none';
    $('#return-reason').value = '';

    renderStockTable();
    renderReturnsTable();
    populateReturnBillSelect();
}

function renderReturnsTable() {
    const tbody = $('#returns-table-body');
    if (!tbody) return;
    tbody.innerHTML = [...AppState.salesReturns].reverse().map(r => `
        <tr>
            <td>${formatDate(r.date)}</td>
            <td class="cell-strong">${r.invoiceNo}</td>
            <td>${escapeHtml(r.customerName)}</td>
            <td>${formatCurrency(r.refundAmount)}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="cell-muted">No returns yet</td></tr>';
    initColumnVisibility('returns-table');
}

async function loadReturns() {
    const data = await dbGet('returns');
    if (data) {
        try { AppState.salesReturns = data; } catch (e) {}
    }
}

// ===================== SALE SUMMARY =====================
function renderSaleSummary() {
    const statsEl = $('#summary-stats');
    const topItemsEl = $('#summary-top-items');
    if (!statsEl) return;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let today = 0, week = 0, month = 0, allTime = 0, billCount = AppState.savedBills.length;
    let todayReturns = 0, monthReturns = 0;

    AppState.savedBills.forEach(b => {
        const created = new Date(b.createdAt || b.invoiceDate);
        allTime += b.grandTotal;
        if (created >= startOfDay) today += b.grandTotal;
        if (created >= startOfWeek) week += b.grandTotal;
        if (created >= startOfMonth) month += b.grandTotal;
    });

    AppState.salesReturns.forEach(r => {
        const created = new Date(r.date || r.createdAt);
        const amt = r.refundAmount || 0;
        if (created >= startOfDay) todayReturns += amt;
        if (created >= startOfMonth) monthReturns += amt;
    });

    const totalReturns = AppState.salesReturns.reduce((s, r) => s + (r.refundAmount || 0), 0);
    const netToday = today - todayReturns;
    const netMonth = month - monthReturns;

    const cards = [
        { label: "Today's Sales", value: formatCurrency(today) },
        { label: 'Net Sales Today', value: formatCurrency(netToday), highlight: true },
        { label: 'This Week', value: formatCurrency(week) },
        { label: 'This Month', value: formatCurrency(month) },
        { label: 'Net Sales Monthly', value: formatCurrency(netMonth), highlight: true },
        { label: 'All-Time Sales', value: formatCurrency(allTime) },
        { label: 'Total Bills', value: billCount },
        { label: 'Total Refunded', value: formatCurrency(totalReturns) }
    ];

    statsEl.innerHTML = cards.map(c => `
        <div class="stat-card${c.highlight ? ' stat-card-highlight' : ''}">
            <span class="stat-label">${c.label}</span>
            <span class="stat-value">${c.value}</span>
        </div>
    `).join('');

    // Sales by Brand breakdown
    const brandSales = {};
    let totalBrandSales = 0;
    AppState.savedBills.forEach(b => {
        b.lineItems.forEach(item => {
            const catalogItem = AppState.items.find(i => i.name === item.name);
            const brand = (catalogItem && catalogItem.brand) ? catalogItem.brand : 'Unbranded';
            const amt = item.total || 0;
            if (!brandSales[brand]) brandSales[brand] = 0;
            brandSales[brand] += amt;
            totalBrandSales += amt;
        });
    });

    const brandEntries = Object.entries(brandSales).sort((a, b) => b[1] - a[1]);
    const summaryBrandEl = $('#summary-brand-section');
    if (summaryBrandEl) {
        if (brandEntries.length === 0) {
            summaryBrandEl.innerHTML = '<div class="placeholder-content"><p>No brand sales data yet.</p></div>';
        } else {
            summaryBrandEl.innerHTML = brandEntries.map(([brand, amt]) => {
                const pct = totalBrandSales > 0 ? ((amt / totalBrandSales) * 100).toFixed(1) : 0;
                return `
                <div class="top-item-row">
                    <div class="top-item-info">
                        <span class="top-item-name">${escapeHtml(brand)}</span>
                        <span class="top-item-meta">${formatCurrency(amt)} · ${pct}%</span>
                    </div>
                    <div class="top-item-bar-track">
                        <div class="top-item-bar top-item-bar-brand" style="width:${pct}%;"></div>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // Top selling items
    const tally = {};
    AppState.savedBills.forEach(b => {
        b.lineItems.forEach(item => {
            const key = item.name || 'Unnamed';
            if (!tally[key]) tally[key] = { qty: 0, amount: 0 };
            tally[key].qty += parseFloat(item.qty) || 0;
            tally[key].amount += item.total || 0;
        });
    });

    const top = Object.entries(tally).sort((a, b) => b[1].amount - a[1].amount).slice(0, 8);
    const maxAmount = top.length ? top[0][1].amount : 1;

    if (top.length === 0) {
        topItemsEl.innerHTML = '<div class="placeholder-content"><p>No sales data yet.</p></div>';
    } else {
        topItemsEl.innerHTML = top.map(([name, data]) => `
            <div class="top-item-row">
                <div class="top-item-info">
                    <span class="top-item-name">${escapeHtml(name)}</span>
                    <span class="top-item-meta">${data.qty} sold · ${formatCurrency(data.amount)}</span>
                </div>
                <div class="top-item-bar-track">
                    <div class="top-item-bar" style="width:${(data.amount / maxAmount) * 100}%;"></div>
                </div>
            </div>
        `).join('');
    }
}

// ===================== CONFIG (FUTURE DB) =====================
async function saveConfig() {
    AppState.config.dbProvider = $('#config-db-provider').value;
    AppState.config.apiUrl = $('#config-api-url').value.trim();
    AppState.config.apiKey = $('#config-api-key').value.trim();
    AppState.config.syncEnabled = false; // reserved for future use

    await dbSet('config', AppState.config);
    showToast('Configuration saved (sync is not active yet)');
}

async function loadConfig() {
    const data = await dbGet('config');
    if (data) {
        try {
            AppState.config = { ...AppState.config, ...data };
            $('#config-db-provider').value = AppState.config.dbProvider || 'none';
            $('#config-api-url').value = AppState.config.apiUrl || '';
            $('#config-api-key').value = AppState.config.apiKey || '';
        } catch (e) { console.error('Error loading config:', e); }
    }
}

// ===================== EXPORT / IMPORT =====================
async function exportAllData() {
    const bundle = {
        exportedAt: new Date().toISOString(),
        app: 'bill-hive',
        version: '1.0',
        companyData: AppState.companyData,
        settings: AppState.settings,
        config: AppState.config,
        items: AppState.items,
        stockLog: AppState.stockLog,
        savedBills: AppState.savedBills,
        salesReturns: AppState.salesReturns,
        invoiceCount: AppState.invoiceCount,
        theme: (await dbGet('theme')) || 'light',
        brands: (await dbGet('brands')) || [],
        suppliers: (await dbGet('suppliers')) || [],
        purchaseOrders: (await dbGet('purchaseOrders')) || []
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bill-hive-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Data exported');
}

function importAllData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.app !== 'bill-hive') {
                if (!await showConfirm('This file does not look like a Bill-Hive backup. Import anyway?', 'Unrecognised File')) return;
            }

            if (data.companyData) await dbSet('company', data.companyData);
            if (data.settings) await dbSet('settings', data.settings);
            if (data.config) await dbSet('config', data.config);
            if (data.items) await dbSet('items', data.items);
            if (data.stockLog) await dbSet('stocklog', data.stockLog);
            if (data.savedBills) await dbSet('bills', data.savedBills);
            if (data.salesReturns) await dbSet('returns', data.salesReturns);
            if (data.invoiceCount) await dbSet('meta', data.invoiceCount);
            if (data.theme) await dbSet('theme', data.theme);
            if (data.brands) await dbSet('brands', data.brands);
            if (data.suppliers) await dbSet('suppliers', data.suppliers);
            if (data.purchaseOrders) await dbSet('purchaseOrders', data.purchaseOrders);

            showToast('Data imported — reloading...');
            setTimeout(() => window.location.reload(), 1000);
        } catch (err) {
            console.error(err);
            showToast('Invalid backup file');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function resetAllData() {
    if (!await showConfirm('This will permanently erase ALL Bill-Hive data from this browser. This cannot be undone.', 'Reset All Data')) return;
    if (!await showConfirm('Final confirmation — erase everything?', 'Are You Sure?')) return;

    await dbClearAll();
    // Also clear any legacy localStorage keys in case migration hasn't run yet
    ['billhive-company', 'billhive-settings', 'billhive-config', 'billhive-items', 'billhive-stocklog',
        'billhive-bills', 'billhive-returns', 'billhive-meta', 'billhive-theme',
        'billhive-brands', 'billhive-suppliers', 'billhive-purchase-orders'].forEach(k => localStorage.removeItem(k));

    showToast('All data erased — reloading...');
    setTimeout(() => window.location.reload(), 800);
}

// ===================== INVOICE METADATA PERSISTENCE =====================
async function saveInvoiceMeta() {
    await dbSet('meta', AppState.invoiceCount);
}

async function loadInvoiceMeta() {
    const data = await dbGet('meta');
    if (data) {
        try { AppState.invoiceCount = data; } catch (e) {}
    }
}

// ===================== INIT =====================
async function init() {
    // v4.01.0: open/migrate IndexedDB before anything else reads storage
    await dbInit();

    // Theme
    await initTheme();

    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    $('#invoice-date').value = today;
    $('#due-date').value = today;

    // Load saved data (must happen before invoice numbering)
    await loadInvoiceMeta();
    await loadCompanyData();
    await loadSettings();
    await loadConfig();
    await loadItems();
    await loadStockLog();
    await loadReturns();

    // Generate invoice number
    $('#invoice-no').value = generateInvoiceNumber();

    // Load saved bills
    const savedBills = await dbGet('bills');
    if (savedBills) {
        try {
            AppState.savedBills = savedBills;
        } catch (e) {}
    }

    // Add one empty line item
    addLineItem();

    // Initial render of secondary pages so they're ready if visited
    renderItemsTable();
    renderStockTable();
    renderPastBills();

    // Honor a deep-link hash (e.g. arriving from index.html#stock)
    const hashPage = (location.hash || '').replace('#', '');
    if (hashPage && $(`#page-${hashPage}`)) {
        navigateTo(hashPage);
    }

    // Setup keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape to close modals/sidebar
        if (e.key === 'Escape') {
            closeSidebar();
            closePreview();
            if ($('#excel-preview-modal')?.classList.contains('active')) closeExcelPreviewModal();
            if ($('#confirm-modal')?.classList.contains('active')) closeConfirmModal();
        }
    });

    // Handle window resize for swipe
    window.addEventListener('resize', () => {
        setupMobileSwipe();
    });

    console.log('Bill-Hive initialized');
}

// Start the app
document.addEventListener('DOMContentLoaded', init);


// ===================== PWA INSTALL =====================
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

// ===================== BRANDS DATALIST FOR ITEM MODAL =====================
async function populateBrandsDatalist() {
    const dl = document.getElementById('brands-datalist');
    if (!dl) return;
    try {
        const brands = (await dbGet('brands')) || [];
        dl.innerHTML = brands.map(b => `<option value="${escapeHtml(b.name)}">`).join('');
    } catch(e) {}
}