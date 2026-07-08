// ===================== BILL-HIVE SHARED CHROME =====================
// Common header / sidebar / theme / utility functions shared by the
// standalone pages (brands.html, suppliers.html, fulfillment.html).
// index.html does NOT include this file — it already defines these
// in script.js.

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getCurrencySymbol() {
    try {
        const saved = localStorage.getItem('billhive-settings');
        if (saved) {
            const s = JSON.parse(saved);
            if (s.currencySymbol) return s.currencySymbol;
        }
    } catch (e) {}
    return '₹';
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

function loadHeaderCompanyLogo() {
    try {
        const saved = localStorage.getItem('billhive-company');
        if (saved) {
            const data = JSON.parse(saved);
            if (data.logo) updateHeaderLogo(data.logo);
        }
    } catch (e) { console.error('Error loading company logo:', e); }
}

// ===================== SHARED CHROME INIT =====================
function initChrome() {
    initTheme();
    loadHeaderCompanyLogo();
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSidebar();
    });
}

document.addEventListener('DOMContentLoaded', initChrome);
