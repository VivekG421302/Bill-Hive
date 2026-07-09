// ===================== CATALOGUE PAGE =====================
let CItems = [];
let CBrands = [];
let CCompany = {};
let CSettings = {};

function loadCatalogue() {
    try {
        const items = localStorage.getItem('billhive-items');
        CItems = items ? JSON.parse(items) : [];
    } catch (e) { CItems = []; }

    try {
        const brands = localStorage.getItem('billhive-brands');
        CBrands = brands ? JSON.parse(brands) : [];
    } catch (e) { CBrands = []; }

    try {
        const company = localStorage.getItem('billhive-company');
        CCompany = company ? JSON.parse(company) : {};
    } catch (e) { CCompany = {}; }

    try {
        const settings = localStorage.getItem('billhive-settings');
        CSettings = settings ? JSON.parse(settings) : {};
    } catch (e) { CSettings = {}; }

    populateBrandFilter();
    renderCatalogue();
}

function populateBrandFilter() {
    const select = $('#catalogue-brand-filter');
    if (!select) return;
    const current = select.value;

    const brandNames = new Set();
    CItems.forEach(it => { if (it.brand) brandNames.add(it.brand); });
    CBrands.forEach(b => { if (b.name) brandNames.add(b.name); });

    const sorted = [...brandNames].sort((a, b) => a.localeCompare(b));
    select.innerHTML = '<option value="">All Brands</option>' +
        sorted.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    if (sorted.includes(current)) select.value = current;
}

function groupItemsByBrand(items) {
    const groups = {};
    items.forEach(it => {
        const key = it.brand && it.brand.trim() ? it.brand.trim() : 'Unbranded';
        if (!groups[key]) groups[key] = [];
        groups[key].push(it);
    });
    return groups;
}

function renderCatalogue() {
    const container = $('#catalogue-content');
    const empty = $('#catalogue-empty');
    if (!container) return;

    const query = ($('#catalogue-search')?.value || '').toLowerCase().trim();
    const brandFilter = $('#catalogue-brand-filter')?.value || '';

    empty.style.display = CItems.length === 0 ? 'flex' : 'none';
    if (CItems.length === 0) {
        container.innerHTML = '';
        return;
    }

    let filtered = CItems.filter(it => {
        const matchesQuery = !query ||
            it.name.toLowerCase().includes(query) ||
            (it.brand || '').toLowerCase().includes(query) ||
            (it.sku || '').toLowerCase().includes(query);
        const matchesBrand = !brandFilter || (it.brand || 'Unbranded') === brandFilter ||
            (brandFilter === 'Unbranded' && !it.brand);
        return matchesQuery && matchesBrand;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="placeholder-content" style="display:flex;"><p>No items match your search.</p></div>`;
        return;
    }

    const groups = groupItemsByBrand(filtered);
    const brandKeys = Object.keys(groups).sort((a, b) => {
        if (a === 'Unbranded') return 1;
        if (b === 'Unbranded') return -1;
        return a.localeCompare(b);
    });

    container.innerHTML = brandKeys.map(brandName => {
        const brandMeta = CBrands.find(b => b.name === brandName);
        const items = groups[brandName];
        return `
        <div class="bill-section" style="margin-top:16px;">
            <div class="section-header">
                ${brandMeta && brandMeta.logo
                    ? `<img src="${brandMeta.logo}" alt="${escapeHtml(brandName)}" style="width:32px;height:32px;object-fit:contain;border-radius:var(--radius-sm);">`
                    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41L13.42 20.58a2 2 0 01-2.83 0L2 12.01V2h10.01l8.58 8.58a2 2 0 010 2.83z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`
                }
                <h2>${escapeHtml(brandName)}</h2>
                <span class="cell-muted" style="margin-left:auto;font-size:0.8125rem;">${items.length} item${items.length === 1 ? '' : 's'}</span>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Name</th><th>SKU</th><th>Price</th><th>Tax %</th><th>Stock</th></tr></thead>
                    <tbody>
                        ${items.map(it => `
                            <tr>
                                <td class="cell-strong">${escapeHtml(it.name)}</td>
                                <td class="cell-muted">${escapeHtml(it.sku || '—')}</td>
                                <td>${formatCurrency(it.price)}</td>
                                <td>${it.tax || 0}%</td>
                                <td>${it.trackStock !== false ? (it.stock || 0) : '—'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }).join('');
}

// ===================== PRINT CATALOGUE =====================
function printCatalogue() {
    const query = ($('#catalogue-search')?.value || '').toLowerCase().trim();
    const brandFilter = $('#catalogue-brand-filter')?.value || '';

    let filtered = CItems.filter(it => {
        const matchesQuery = !query ||
            it.name.toLowerCase().includes(query) ||
            (it.brand || '').toLowerCase().includes(query) ||
            (it.sku || '').toLowerCase().includes(query);
        const matchesBrand = !brandFilter || (it.brand || 'Unbranded') === brandFilter ||
            (brandFilter === 'Unbranded' && !it.brand);
        return matchesQuery && matchesBrand;
    });

    if (filtered.length === 0) {
        showToast('No items to print with the current filters');
        return;
    }

    const groups = groupItemsByBrand(filtered);
    const brandKeys = Object.keys(groups).sort((a, b) => {
        if (a === 'Unbranded') return 1;
        if (b === 'Unbranded') return -1;
        return a.localeCompare(b);
    });

    const symbol = CSettings.currencySymbol || '₹';
    const logoHtml = CCompany.logo
        ? `<img src="${CCompany.logo}" alt="Logo" style="max-width:220px;max-height:70px;object-fit:contain;filter:grayscale(100%) contrast(1.15);">`
        : '';

    const sectionsHtml = brandKeys.map(brandName => `
        <div class="cat-section">
            <div class="cat-brand-name">${escapeHtml(brandName)}</div>
            <table class="cat-table">
                <thead>
                    <tr><th>Item</th><th>SKU</th><th class="right">Price</th><th class="right">Tax %</th></tr>
                </thead>
                <tbody>
                    ${groups[brandName].map(it => `
                        <tr>
                            <td>${escapeHtml(it.name)}</td>
                            <td>${escapeHtml(it.sku || '—')}</td>
                            <td class="right">${symbol} ${parseFloat(it.price || 0).toFixed(2)}</td>
                            <td class="right">${it.tax || 0}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `).join('');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Catalogue — ${escapeHtml(CCompany.name || 'Bill-Hive')}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Courier New', 'Consolas', monospace;
                    font-weight: 700;
                    color: #000;
                    background: #fff;
                    padding: 24px;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .cat-header { text-align: center; padding-bottom: 14px; border-bottom: 3px double #000; margin-bottom: 18px; }
                .cat-company-name { font-size: 22px; font-weight: 800; margin-top: 6px; }
                .cat-sub { font-size: 12px; font-weight: 700; margin-top: 2px; }
                .cat-title { font-size: 14px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-top: 8px; }
                .cat-section { margin-bottom: 20px; break-inside: avoid; }
                .cat-brand-name { font-size: 15px; font-weight: 800; text-transform: uppercase; padding: 4px 0; border-bottom: 2px solid #000; margin-bottom: 6px; }
                .cat-table { width: 100%; border-collapse: collapse; font-size: 12px; font-weight: 700; }
                .cat-table th { text-align: left; border-bottom: 2px solid #000; padding: 4px 6px; font-weight: 800; }
                .cat-table td { padding: 4px 6px; border-bottom: 1px dashed #999; }
                .cat-table .right { text-align: right; }
                .cat-footer { text-align: center; font-size: 10px; font-weight: 700; margin-top: 24px; padding-top: 8px; border-top: 2px dashed #000; }
                @media print {
                    body { padding: 12px; }
                    .cat-section { page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="cat-header">
                ${logoHtml}
                <div class="cat-company-name">${escapeHtml(CCompany.name || 'Your Company')}</div>
                ${CCompany.address ? `<div class="cat-sub">${escapeHtml(CCompany.address)}</div>` : ''}
                ${CCompany.phone || CCompany.email ? `<div class="cat-sub">${escapeHtml([CCompany.phone, CCompany.email].filter(Boolean).join(' · '))}</div>` : ''}
                <div class="cat-title">Product Catalogue</div>
            </div>
            ${sectionsHtml}
            <div class="cat-footer">Generated by Bill-Hive on ${formatDate(new Date())}</div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
    };
}

document.addEventListener('DOMContentLoaded', loadCatalogue);
