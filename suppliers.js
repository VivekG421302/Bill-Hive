// ===================== SUPPLIERS PAGE =====================
let Suppliers = [];
let supplierIdCounter = 0;
let editingSupplierId = null;

async function loadSuppliers() {
    await dbInit();
    const data = await dbGet('suppliers');
    if (data) {
        try {
            Suppliers = data;
            supplierIdCounter = Suppliers.reduce((max, s) => Math.max(max, s.id || 0), 0);
        } catch (e) { console.error('Error loading suppliers:', e); }
    }
    renderSuppliers();
}

async function saveSuppliersStorage() {
    await dbSet('suppliers', Suppliers);
}

function renderSuppliers() {
    const tbody = $('#suppliers-table-body');
    const empty = $('#suppliers-empty');
    if (!tbody) return;

    const query = ($('#suppliers-search')?.value || '').toLowerCase().trim();
    const filtered = Suppliers.filter(s =>
        !query ||
        s.name.toLowerCase().includes(query) ||
        (s.contactPerson || '').toLowerCase().includes(query) ||
        (s.itemsSupplied || '').toLowerCase().includes(query)
    );

    empty.style.display = Suppliers.length === 0 ? 'flex' : 'none';

    tbody.innerHTML = filtered.map(s => `
        <tr>
            <td class="cell-strong">${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.contactPerson) || '—'}</td>
            <td>${escapeHtml(s.phone) || '—'}</td>
            <td>${escapeHtml(s.itemsSupplied) || '—'}</td>
            <td class="cell-actions">
                <button class="icon-btn" onclick="openSupplierModal(${s.id})" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                </button>
                <button class="icon-btn icon-btn-danger" onclick="deleteSupplier(${s.id})" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
            </td>
        </tr>
    `).join('') || (Suppliers.length > 0 ? '<tr><td colspan="5" class="cell-muted">No suppliers match your search.</td></tr>' : '');
}

function openSupplierModal(id = null) {
    editingSupplierId = id;
    const title = $('#supplier-modal-title');

    if (id) {
        const s = Suppliers.find(x => x.id === id);
        if (!s) return;
        title.textContent = 'Edit Supplier';
        $('#supplier-form-name').value = s.name || '';
        $('#supplier-form-contact').value = s.contactPerson || '';
        $('#supplier-form-phone').value = s.phone || '';
        $('#supplier-form-email').value = s.email || '';
        $('#supplier-form-address').value = s.address || '';
        $('#supplier-form-items').value = s.itemsSupplied || '';
        $('#supplier-form-notes').value = s.notes || '';
    } else {
        title.textContent = 'Add Supplier';
        ['#supplier-form-name', '#supplier-form-contact', '#supplier-form-phone', '#supplier-form-email',
         '#supplier-form-address', '#supplier-form-items', '#supplier-form-notes'].forEach(id => { $(id).value = ''; });
    }
    $('#supplier-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSupplierModal() {
    $('#supplier-modal').classList.remove('active');
    document.body.style.overflow = '';
    editingSupplierId = null;
}

async function saveSupplierForm() {
    const name = $('#supplier-form-name').value.trim();
    if (!name) {
        showToast('Supplier name is required');
        return;
    }
    const data = {
        name,
        contactPerson: $('#supplier-form-contact').value.trim(),
        phone: $('#supplier-form-phone').value.trim(),
        email: $('#supplier-form-email').value.trim(),
        address: $('#supplier-form-address').value.trim(),
        itemsSupplied: $('#supplier-form-items').value.trim(),
        notes: $('#supplier-form-notes').value.trim()
    };

    if (editingSupplierId) {
        const s = Suppliers.find(x => x.id === editingSupplierId);
        if (s) Object.assign(s, data);
    } else {
        supplierIdCounter++;
        Suppliers.push({ id: supplierIdCounter, ...data });
    }

    await saveSuppliersStorage();
    renderSuppliers();
    closeSupplierModal();
    showToast('Supplier saved');
}

async function deleteSupplier(id) {
    if (!confirm('Delete this supplier? Existing purchase orders will keep their saved supplier name.')) return;
    Suppliers = Suppliers.filter(s => s.id !== id);
    await saveSuppliersStorage();
    renderSuppliers();
    showToast('Supplier deleted');
}

document.addEventListener('DOMContentLoaded', loadSuppliers);
