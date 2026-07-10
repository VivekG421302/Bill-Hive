// ===================== YOUR BRANDS PAGE =====================
let Brands = [];
let brandIdCounter = 0;
let editingBrandId = null;
let brandFormLogoData = '';

async function loadBrands() {
    await dbInit();
    const data = await dbGet('brands');
    if (data) {
        try {
            Brands = data;
            brandIdCounter = Brands.reduce((max, b) => Math.max(max, b.id || 0), 0);
        } catch (e) { console.error('Error loading brands:', e); }
    }
    renderBrands();
}

async function saveBrandsStorage() {
    await dbSet('brands', Brands);
}

function renderBrands() {
    const grid = $('#brand-grid');
    const empty = $('#brands-empty');
    if (!grid) return;

    const query = ($('#brands-search')?.value || '').toLowerCase().trim();
    const filtered = Brands.filter(b => !query || b.name.toLowerCase().includes(query));

    empty.style.display = Brands.length === 0 ? 'flex' : 'none';
    grid.style.display = Brands.length === 0 ? 'none' : 'grid';

    grid.innerHTML = filtered.map(b => `
        <div class="brand-card">
            <div class="brand-card-logo">
                ${b.logo
                    ? `<img src="${b.logo}" alt="${escapeHtml(b.name)}">`
                    : `<div class="brand-card-logo-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.59 13.41L13.42 20.58a2 2 0 01-2.83 0L2 12.01V2h10.01l8.58 8.58a2 2 0 010 2.83z"/>
                            <line x1="7" y1="7" x2="7.01" y2="7"/>
                        </svg>
                       </div>`
                }
            </div>
            <div class="brand-card-body">
                <div class="brand-card-name">${escapeHtml(b.name)}</div>
                ${b.description ? `<div class="brand-card-desc">${escapeHtml(b.description)}</div>` : ''}
            </div>
            <div class="brand-card-actions">
                <button class="icon-btn" onclick="openBrandModal(${b.id})" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                </button>
                <button class="icon-btn icon-btn-danger" onclick="deleteBrand(${b.id})" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
            </div>
        </div>
    `).join('');

    if (Brands.length > 0 && filtered.length === 0) {
        grid.innerHTML = `<div class="placeholder-content" style="grid-column:1/-1;"><p>No brands match your search.</p></div>`;
    }
}

function openBrandModal(id = null) {
    editingBrandId = id;
    brandFormLogoData = '';
    const title = $('#brand-modal-title');
    const preview = $('#brand-form-logo-preview');
    preview.style.display = 'none';
    preview.src = '';

    if (id) {
        const b = Brands.find(x => x.id === id);
        if (!b) return;
        title.textContent = 'Edit Brand';
        $('#brand-form-name').value = b.name || '';
        $('#brand-form-description').value = b.description || '';
        if (b.logo) {
            brandFormLogoData = b.logo;
            preview.src = b.logo;
            preview.style.display = 'block';
        }
    } else {
        title.textContent = 'Add Brand';
        $('#brand-form-name').value = '';
        $('#brand-form-description').value = '';
    }
    $('#brand-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeBrandModal() {
    $('#brand-modal').classList.remove('active');
    document.body.style.overflow = '';
    editingBrandId = null;
}

function handleBrandLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        showToast('Logo must be under 2MB');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        brandFormLogoData = e.target.result;
        const preview = $('#brand-form-logo-preview');
        preview.src = brandFormLogoData;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

async function saveBrandForm() {
    const name = $('#brand-form-name').value.trim();
    if (!name) {
        showToast('Brand name is required');
        return;
    }
    const description = $('#brand-form-description').value.trim();

    if (editingBrandId) {
        const b = Brands.find(x => x.id === editingBrandId);
        if (b) {
            b.name = name;
            b.description = description;
            if (brandFormLogoData) b.logo = brandFormLogoData;
        }
    } else {
        brandIdCounter++;
        Brands.push({ id: brandIdCounter, name, description, logo: brandFormLogoData || '' });
    }

    await saveBrandsStorage();
    renderBrands();
    closeBrandModal();
    showToast('Brand saved');
}

async function deleteBrand(id) {
    if (!confirm('Delete this brand?')) return;
    Brands = Brands.filter(b => b.id !== id);
    await saveBrandsStorage();
    renderBrands();
    showToast('Brand deleted');
}

document.addEventListener('DOMContentLoaded', loadBrands);
