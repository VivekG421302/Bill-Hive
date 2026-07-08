// ===================== BILL-HIVE APP =====================
// Complete POS Billing Application

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
        currencySymbol: '₹'
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
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.contains('dark-mode');

    if (isDark) {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        localStorage.setItem('billhive-theme', 'light');
    } else {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        localStorage.setItem('billhive-theme', 'dark');
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('billhive-theme');
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
                    <input type="text" class="line-item-name" 
                        value="${item.name}" 
                        placeholder="Search or type item name"
                        list="items-datalist"
                        onchange="updateLineItemName(${item.id}, this.value)"
                        style="flex:1;padding:6px 10px;border:1.5px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-input);font-size:0.875rem;font-weight:600;">
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

function generatePOSBillHTML(billData, forPrint = false) {
    const company = billData.companyData;
    const settings = billData.settings;
    const symbol = settings.currencySymbol || '₹';

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
        logoHtml = `<img src="${company.logo}" class="pos-logo" alt="Logo">`;
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
        <div class="pos-bill" id="${forPrint ? 'print-bill' : ''}">
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

            <div style="text-align:center;font-size:8px;margin-top:6px;color:#666;">
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

    // Check all items have names
    for (const item of AppState.lineItems) {
        if (!item.name || item.name.trim() === '') {
            showToast('Please enter item names for all line items');
            return false;
        }
    }

    return true;
}

function saveBill() {
    if (!validateBill()) return;

    const billData = getBillData();
    billData.id = Date.now();
    billData.createdAt = new Date().toISOString();

    AppState.savedBills.push(billData);
    localStorage.setItem('billhive-bills', JSON.stringify(AppState.savedBills));

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
    saveStockStorage();
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

function saveAndPrint() {
    const billData = saveBill();
    if (!billData) return;

    setTimeout(() => {
        printBill(billData);
    }, 300);
}

function printBill(billData) {
    const printWindow = window.open('', '_blank');
    const posHtml = generatePOSBillHTML(billData, true);

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Bill ${billData.invoiceNo}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Courier New', monospace; 
                    background: #fff; 
                    padding: 0;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .pos-bill { 
                    max-width: 300px; 
                    margin: 0 auto; 
                    padding: 8px;
                    font-size: 10px;
                    line-height: 1.4;
                }
                .pos-header { text-align: center; padding-bottom: 6px; border-bottom: 1px dashed #000; margin-bottom: 6px; }
                .pos-logo { max-width: 50px; max-height: 50px; margin: 0 auto 4px; display: block; }
                .pos-company-name { font-size: 12px; font-weight: bold; }
                .pos-gst, .pos-address, .pos-contact { font-size: 9px; line-height: 1.3; }
                .pos-divider { border: none; border-top: 1px dashed #000; margin: 5px 0; }
                .pos-meta { display: flex; justify-content: space-between; font-size: 9px; margin-bottom: 2px; }
                .pos-meta-label { font-weight: bold; }
                .pos-customer-label { font-weight: bold; font-size: 9px; }
                .pos-table { width: 100%; border-collapse: collapse; font-size: 9px; margin: 4px 0; }
                .pos-table th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; text-align: left; font-weight: bold; }
                .pos-table td { padding: 1px 2px; vertical-align: top; }
                .pos-td-right { text-align: right; }
                .pos-td-center { text-align: center; }
                .pos-totals { border-top: 1px solid #000; padding-top: 3px; font-size: 9px; }
                .pos-total-row { display: flex; justify-content: space-between; margin-bottom: 1px; }
                .pos-total-row.grand { font-weight: bold; font-size: 10px; border-top: 1px solid #000; padding-top: 2px; margin-top: 2px; }
                .pos-saved { text-align: center; font-size: 9px; margin: 4px 0; font-style: italic; }
                .pos-payment { font-size: 9px; margin: 3px 0; }
                .pos-thankyou { text-align: center; font-size: 10px; font-weight: bold; margin: 4px 0; }
                .pos-terms { font-size: 8px; text-align: center; line-height: 1.3; margin-top: 3px; padding-top: 3px; border-top: 1px dashed #000; }
                @media print { body { margin: 0; } }
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

function clearBill() {
    if (AppState.lineItems.length > 0) {
        if (!confirm('Are you sure you want to clear this bill? All items will be removed.')) {
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

function saveCompanyData() {
    AppState.companyData.name = $('#company-name').value;
    AppState.companyData.gst = $('#company-gst').value;
    AppState.companyData.address = $('#company-address').value;
    AppState.companyData.phone = $('#company-phone').value;
    AppState.companyData.email = $('#company-email').value;

    localStorage.setItem('billhive-company', JSON.stringify(AppState.companyData));
    showToast('Company data saved!');
}

function loadCompanyData() {
    const saved = localStorage.getItem('billhive-company');
    if (saved) {
        try {
            const data = JSON.parse(saved);
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

function saveSettings() {
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

    localStorage.setItem('billhive-settings', JSON.stringify(AppState.settings));
    showToast('Settings saved!');
}

function loadSettings() {
    const saved = localStorage.getItem('billhive-settings');
    if (saved) {
        try {
            const data = JSON.parse(saved);
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

function saveItemsStorage() {
    localStorage.setItem('billhive-items', JSON.stringify(AppState.items));
    renderItemsDatalist();
}

function loadItems() {
    const saved = localStorage.getItem('billhive-items');
    if (saved) {
        try {
            AppState.items = JSON.parse(saved);
            const maxId = AppState.items.reduce((m, it) => Math.max(m, it.id), 0);
            itemIdCounter = maxId;
        } catch (e) { console.error('Error loading items:', e); }
    }
    renderItemsDatalist();
}

function openItemModal(id = null) {
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
    $('#item-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeItemModal() {
    $('#item-modal').classList.remove('active');
    document.body.style.overflow = '';
    editingItemId = null;
}

function saveItemForm() {
    const name = $('#item-form-name').value.trim();
    if (!name) {
        showToast('Please enter an item name');
        return;
    }

    const data = {
        name,
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

    saveItemsStorage();
    closeItemModal();
    renderItemsTable();
    renderStockTable();
}

function deleteItem(id) {
    if (!confirm('Delete this item? This will not affect past bills.')) return;
    AppState.items = AppState.items.filter(i => i.id !== id);
    saveItemsStorage();
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
            <td>${formatCurrency(it.price)}</td>
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
}

// ===================== STOCK =====================
let stockAdjustItemId = null;

function saveStockStorage() {
    saveItemsStorage();
    localStorage.setItem('billhive-stocklog', JSON.stringify(AppState.stockLog));
}

function loadStockLog() {
    const saved = localStorage.getItem('billhive-stocklog');
    if (saved) {
        try { AppState.stockLog = JSON.parse(saved); } catch (e) {}
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
}

function openStockModal(id) {
    const item = AppState.items.find(i => i.id === id);
    if (!item) return;
    stockAdjustItemId = id;
    $('#stock-modal-item-label').textContent = `Item: ${item.name} (Current stock: ${item.stock})`;
    $('#stock-adjust-type').value = 'add';
    $('#stock-adjust-qty').value = '';
    $('#stock-adjust-note').value = '';
    $('#stock-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeStockModal() {
    $('#stock-modal').classList.remove('active');
    document.body.style.overflow = '';
    stockAdjustItemId = null;
}

function applyStockAdjustment() {
    const item = AppState.items.find(i => i.id === stockAdjustItemId);
    if (!item) return;

    const type = $('#stock-adjust-type').value;
    const qty = parseFloat($('#stock-adjust-qty').value) || 0;
    const note = $('#stock-adjust-note').value.trim();

    let delta = 0;
    if (type === 'add') { item.stock += qty; delta = qty; }
    else if (type === 'remove') { item.stock = Math.max(0, item.stock - qty); delta = -qty; }
    else if (type === 'set') { delta = qty - item.stock; item.stock = qty; }

    logStockMovement(item.id, item.name, type === 'set' ? 'Adjustment (set)' : (type === 'add' ? 'Manual Add' : 'Manual Remove'), delta, note || 'Manual adjustment');

    saveStockStorage();
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

function deletePastBill(id) {
    if (!confirm('Delete this bill permanently?')) return;
    AppState.savedBills = AppState.savedBills.filter(b => b.id !== id);
    localStorage.setItem('billhive-bills', JSON.stringify(AppState.savedBills));
    renderPastBills();
    showToast('Bill deleted');
}

// ===================== SALES RETURN =====================
function populateReturnBillSelect() {
    const select = $('#return-bill-select');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">-- Select an invoice --</option>' +
        [...AppState.savedBills].reverse().map(b => `<option value="${b.id}">${b.invoiceNo} — ${escapeHtml(b.customerName)} — ${formatCurrency(b.grandTotal)}</option>`).join('');
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

    container.innerHTML = `
        <div class="table-wrap">
            <table class="data-table">
                <thead><tr><th>Return</th><th>Item</th><th>Sold Qty</th><th>Return Qty</th><th>Amount</th></tr></thead>
                <tbody>
                    ${bill.lineItems.map((item, idx) => `
                        <tr>
                            <td><input type="checkbox" class="return-item-check" data-idx="${idx}" onchange="calculateReturnAmount()"></td>
                            <td>${escapeHtml(item.name)}</td>
                            <td>${item.qty}</td>
                            <td><input type="number" class="return-item-qty" data-idx="${idx}" min="0" max="${item.qty}" value="${item.qty}" step="0.01" oninput="calculateReturnAmount()" style="width:70px;padding:4px 8px;border:1.5px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-input);"></td>
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
            const returnQty = Math.min(parseFloat(qtyInput.value) || 0, item.qty);
            const perUnit = item.total / (parseFloat(item.qty) || 1);
            refund += perUnit * returnQty;
        }
    });

    $('#return-refund-amount').textContent = formatCurrency(refund);
}

function processSalesReturn() {
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
            const returnQty = Math.min(parseFloat(qtyInput.value) || 0, item.qty);
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
    localStorage.setItem('billhive-returns', JSON.stringify(AppState.salesReturns));
    saveStockStorage();

    showToast(`Return processed — refund ${formatCurrency(refund)}`);
    $('#return-bill-select').value = '';
    $('#return-items-container').innerHTML = '';
    $('#return-summary').style.display = 'none';
    $('#return-reason').value = '';

    renderStockTable();
    renderReturnsTable();
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
}

function loadReturns() {
    const saved = localStorage.getItem('billhive-returns');
    if (saved) {
        try { AppState.salesReturns = JSON.parse(saved); } catch (e) {}
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

    AppState.savedBills.forEach(b => {
        const created = new Date(b.createdAt || b.invoiceDate);
        allTime += b.grandTotal;
        if (created >= startOfDay) today += b.grandTotal;
        if (created >= startOfWeek) week += b.grandTotal;
        if (created >= startOfMonth) month += b.grandTotal;
    });

    const totalReturns = AppState.salesReturns.reduce((s, r) => s + r.refundAmount, 0);

    const cards = [
        { label: "Today's Sales", value: formatCurrency(today) },
        { label: 'This Week', value: formatCurrency(week) },
        { label: 'This Month', value: formatCurrency(month) },
        { label: 'All-Time Sales', value: formatCurrency(allTime) },
        { label: 'Total Bills', value: billCount },
        { label: 'Total Refunded', value: formatCurrency(totalReturns) }
    ];

    statsEl.innerHTML = cards.map(c => `
        <div class="stat-card">
            <span class="stat-label">${c.label}</span>
            <span class="stat-value">${c.value}</span>
        </div>
    `).join('');

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
function saveConfig() {
    AppState.config.dbProvider = $('#config-db-provider').value;
    AppState.config.apiUrl = $('#config-api-url').value.trim();
    AppState.config.apiKey = $('#config-api-key').value.trim();
    AppState.config.syncEnabled = false; // reserved for future use

    localStorage.setItem('billhive-config', JSON.stringify(AppState.config));
    showToast('Configuration saved (sync is not active yet)');
}

function loadConfig() {
    const saved = localStorage.getItem('billhive-config');
    if (saved) {
        try {
            AppState.config = { ...AppState.config, ...JSON.parse(saved) };
            $('#config-db-provider').value = AppState.config.dbProvider || 'none';
            $('#config-api-url').value = AppState.config.apiUrl || '';
            $('#config-api-key').value = AppState.config.apiKey || '';
        } catch (e) { console.error('Error loading config:', e); }
    }
}

// ===================== EXPORT / IMPORT =====================
function exportAllData() {
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
        theme: localStorage.getItem('billhive-theme') || 'light'
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
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.app !== 'bill-hive') {
                if (!confirm('This file does not look like a Bill-Hive backup. Import anyway?')) return;
            }

            if (data.companyData) localStorage.setItem('billhive-company', JSON.stringify(data.companyData));
            if (data.settings) localStorage.setItem('billhive-settings', JSON.stringify(data.settings));
            if (data.config) localStorage.setItem('billhive-config', JSON.stringify(data.config));
            if (data.items) localStorage.setItem('billhive-items', JSON.stringify(data.items));
            if (data.stockLog) localStorage.setItem('billhive-stocklog', JSON.stringify(data.stockLog));
            if (data.savedBills) localStorage.setItem('billhive-bills', JSON.stringify(data.savedBills));
            if (data.salesReturns) localStorage.setItem('billhive-returns', JSON.stringify(data.salesReturns));
            if (data.invoiceCount) localStorage.setItem('billhive-meta', JSON.stringify(data.invoiceCount));
            if (data.theme) localStorage.setItem('billhive-theme', data.theme);

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

function resetAllData() {
    if (!confirm('This will permanently erase ALL Bill-Hive data from this browser. Continue?')) return;
    if (!confirm('Are you absolutely sure? This cannot be undone.')) return;

    ['billhive-company', 'billhive-settings', 'billhive-config', 'billhive-items', 'billhive-stocklog',
        'billhive-bills', 'billhive-returns', 'billhive-meta', 'billhive-theme'].forEach(k => localStorage.removeItem(k));

    showToast('All data erased — reloading...');
    setTimeout(() => window.location.reload(), 800);
}

// ===================== INVOICE METADATA PERSISTENCE =====================
function saveInvoiceMeta() {
    localStorage.setItem('billhive-meta', JSON.stringify(AppState.invoiceCount));
}

function loadInvoiceMeta() {
    const saved = localStorage.getItem('billhive-meta');
    if (saved) {
        try { AppState.invoiceCount = JSON.parse(saved); } catch (e) {}
    }
}

// ===================== INIT =====================
function init() {
    // Theme
    initTheme();

    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    $('#invoice-date').value = today;
    $('#due-date').value = today;

    // Load saved data (must happen before invoice numbering)
    loadInvoiceMeta();
    loadCompanyData();
    loadSettings();
    loadConfig();
    loadItems();
    loadStockLog();
    loadReturns();

    // Generate invoice number
    $('#invoice-no').value = generateInvoiceNumber();

    // Load saved bills
    const savedBills = localStorage.getItem('billhive-bills');
    if (savedBills) {
        try {
            AppState.savedBills = JSON.parse(savedBills);
        } catch (e) {}
    }

    // Add one empty line item
    addLineItem();

    // Initial render of secondary pages so they're ready if visited
    renderItemsTable();
    renderStockTable();
    renderPastBills();

    // Setup keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape to close modals/sidebar
        if (e.key === 'Escape') {
            closeSidebar();
            closePreview();
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
