// ===================== FULFILLMENT PAGE =====================
const LOW_STOCK_THRESHOLD = 5;
const DEFAULT_REORDER_QTY = 10;

let FItems = [];        // catalog items (billhive-items)
let FSuppliers = [];     // suppliers (billhive-suppliers)
let PurchaseOrders = []; // purchase orders (billhive-purchase-orders)
let poIdCounter = 0;

function loadFulfillmentData() {
    try {
        const items = localStorage.getItem('billhive-items');
        FItems = items ? JSON.parse(items) : [];
    } catch (e) { FItems = []; }

    try {
        const suppliers = localStorage.getItem('billhive-suppliers');
        FSuppliers = suppliers ? JSON.parse(suppliers) : [];
    } catch (e) { FSuppliers = []; }

    try {
        const pos = localStorage.getItem('billhive-purchase-orders');
        PurchaseOrders = pos ? JSON.parse(pos) : [];
        poIdCounter = PurchaseOrders.reduce((max, p) => Math.max(max, p.id || 0), 0);
    } catch (e) { PurchaseOrders = []; }

    populateSupplierSelect();
    renderRestockTable();
    renderPOTable();
}

function savePOStorage() {
    localStorage.setItem('billhive-purchase-orders', JSON.stringify(PurchaseOrders));
}

function saveItemsStorage() {
    localStorage.setItem('billhive-items', JSON.stringify(FItems));
}

function saveStockLogEntry(itemId, itemName, type, qty, reference) {
    let log = [];
    try {
        const saved = localStorage.getItem('billhive-stocklog');
        log = saved ? JSON.parse(saved) : [];
    } catch (e) { log = []; }
    log.unshift({
        id: Date.now() + Math.random(),
        date: new Date().toISOString(),
        itemId, itemName, type, qty, reference: reference || '-'
    });
    log = log.slice(0, 200);
    localStorage.setItem('billhive-stocklog', JSON.stringify(log));
}

function populateSupplierSelect() {
    const select = $('#po-supplier-select');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">-- Select a supplier --</option>' +
        FSuppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    if (FSuppliers.some(s => String(s.id) === current)) select.value = current;

    if (FSuppliers.length === 0) {
        select.innerHTML = '<option value="">No suppliers added yet</option>';
    }
}

function getLowStockItems() {
    return FItems.filter(it => it.trackStock !== false && (it.stock || 0) <= LOW_STOCK_THRESHOLD);
}

function renderRestockTable() {
    const tbody = $('#restock-table-body');
    const empty = $('#restock-empty');
    if (!tbody) return;

    const lowStock = getLowStockItems();
    empty.style.display = lowStock.length === 0 ? 'flex' : 'none';

    tbody.innerHTML = lowStock.map(it => {
        const stock = it.stock || 0;
        const suggested = Math.max(DEFAULT_REORDER_QTY - stock, DEFAULT_REORDER_QTY);
        return `
        <tr>
            <td><input type="checkbox" class="restock-check" data-item-id="${it.id}"></td>
            <td class="cell-strong">${escapeHtml(it.name)}</td>
            <td>${stock}</td>
            <td><span class="status-pill ${stock === 0 ? 'status-low' : 'status-low'}">${stock === 0 ? 'Out of Stock' : 'Low Stock'}</span></td>
            <td><input type="number" class="restock-qty" data-item-id="${it.id}" min="1" step="1" value="${suggested}" style="width:90px;"></td>
        </tr>`;
    }).join('');
}

function createPurchaseOrder() {
    const supplierId = $('#po-supplier-select').value;
    if (!supplierId) {
        showToast('Please select a supplier');
        return;
    }
    const supplier = FSuppliers.find(s => String(s.id) === String(supplierId));
    if (!supplier) {
        showToast('Selected supplier not found');
        return;
    }

    const checks = $$('.restock-check');
    const items = [];
    checks.forEach(chk => {
        if (chk.checked) {
            const itemId = chk.dataset.itemId;
            const qtyInput = $(`.restock-qty[data-item-id="${itemId}"]`);
            const qty = parseInt(qtyInput?.value, 10) || 0;
            const item = FItems.find(i => String(i.id) === String(itemId));
            if (item && qty > 0) {
                items.push({ itemId: item.id, name: item.name, qty });
            }
        }
    });

    if (items.length === 0) {
        showToast('Select at least one item to order');
        return;
    }

    poIdCounter++;
    const po = {
        id: poIdCounter,
        poNumber: 'PO-' + String(poIdCounter).padStart(4, '0'),
        supplierId: supplier.id,
        supplierName: supplier.name,
        date: new Date().toISOString(),
        items,
        status: 'Pending'
    };

    PurchaseOrders.unshift(po);
    savePOStorage();
    renderPOTable();
    showToast(`Purchase order ${po.poNumber} created`);
}

function renderPOTable() {
    const tbody = $('#po-table-body');
    const empty = $('#po-empty');
    if (!tbody) return;

    empty.style.display = PurchaseOrders.length === 0 ? 'flex' : 'none';

    tbody.innerHTML = PurchaseOrders.map(po => {
        const itemsSummary = po.items.map(i => `${escapeHtml(i.name)} (${i.qty})`).join(', ');
        const statusClass = po.status === 'Received' ? 'status-ok' : 'status-low';
        let actionBtns = '';
        if (po.status === 'Pending') {
            actionBtns += `<button class="icon-btn" title="Mark Ordered" onclick="markPOOrdered(${po.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>`;
        } else if (po.status === 'Ordered') {
            actionBtns += `<button class="icon-btn" title="Mark Received" onclick="markPOReceived(${po.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            </button>`;
        }
        actionBtns += `<button class="icon-btn" title="View" onclick="viewPO(${po.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>`;
        actionBtns += `<button class="icon-btn icon-btn-danger" title="Delete" onclick="deletePO(${po.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>`;

        return `
        <tr>
            <td class="cell-strong">${po.poNumber}</td>
            <td>${formatDate(po.date)}</td>
            <td>${escapeHtml(po.supplierName)}</td>
            <td class="cell-muted" style="max-width:220px;">${itemsSummary}</td>
            <td><span class="status-pill ${statusClass}">${po.status}</span></td>
            <td class="cell-actions">${actionBtns}</td>
        </tr>`;
    }).join('');
}

function markPOOrdered(id) {
    const po = PurchaseOrders.find(p => p.id === id);
    if (!po) return;
    po.status = 'Ordered';
    savePOStorage();
    renderPOTable();
    showToast(`${po.poNumber} marked as ordered`);
}

function markPOReceived(id) {
    const po = PurchaseOrders.find(p => p.id === id);
    if (!po) return;
    if (!confirm(`Mark ${po.poNumber} as received? This will add the ordered quantities to stock.`)) return;

    po.items.forEach(line => {
        const item = FItems.find(i => String(i.id) === String(line.itemId));
        if (item) {
            item.stock = (item.stock || 0) + line.qty;
            saveStockLogEntry(item.id, item.name, 'Purchase Received', line.qty, po.poNumber);
        }
    });
    saveItemsStorage();
    po.status = 'Received';
    savePOStorage();
    renderPOTable();
    renderRestockTable();
    showToast(`${po.poNumber} received — stock updated`);
}

function deletePO(id) {
    if (!confirm('Delete this purchase order? This does not reverse any stock already received.')) return;
    PurchaseOrders = PurchaseOrders.filter(p => p.id !== id);
    savePOStorage();
    renderPOTable();
    showToast('Purchase order deleted');
}

function viewPO(id) {
    const po = PurchaseOrders.find(p => p.id === id);
    if (!po) return;
    $('#po-modal-title').textContent = po.poNumber;
    $('#po-modal-body').innerHTML = `
        <div class="data-view-row"><span class="data-view-label">Supplier</span><span class="data-view-value">${escapeHtml(po.supplierName)}</span></div>
        <div class="data-view-row"><span class="data-view-label">Date</span><span class="data-view-value">${formatDate(po.date)}</span></div>
        <div class="data-view-row"><span class="data-view-label">Status</span><span class="data-view-value">${po.status}</span></div>
        <div class="table-wrap" style="margin-top:12px;">
            <table class="data-table">
                <thead><tr><th>Item</th><th>Qty</th></tr></thead>
                <tbody>
                    ${po.items.map(i => `<tr><td>${escapeHtml(i.name)}</td><td>${i.qty}</td></tr>`).join('')}
                </tbody>
            </table>
        </div>
    `;
    $('#po-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePoModal() {
    $('#po-modal').classList.remove('active');
    document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', loadFulfillmentData);
