# Bill-Hive — Technical Context

> **For AI assistants and new developers picking this project up.**  
> Read this before touching any code. It tells you what every file does, where every feature lives, and the conventions you must follow to avoid breaking things.

---

## Project at a glance

Bill-Hive is a **vanilla HTML/CSS/JS POS billing app** — no build step, no framework, no server. Everything runs in the browser. Data is stored in `localStorage`. It is also a **PWA** (Progressive Web App) installable on desktop and mobile via Chrome/Edge.

- **Entry point:** `index.html` — the main SPA shell. All core billing pages are sections inside this single file, toggled by `navigateTo(page)`.
- **Standalone pages:** `brands.html`, `suppliers.html`, `fulfillment.html`, `catalogue.html` — separate HTML documents that share `styles.css` and `chrome.js`.
- **No `<form>` tags are used** (they would trigger browser validation and page reloads). All inputs use event handlers (`onclick`, `onchange`, `oninput`).

---

## File map

| File | Role |
|---|---|
| `index.html` | Main app shell. Contains all core page sections and modals. |
| `script.js` | All logic for `index.html` — state, rendering, bill CRUD, items, stock, returns, summary, settings, PWA install. |
| `styles.css` | Shared CSS for every page. CSS custom properties for theming. No preprocessor. |
| `chrome.js` | Shared header/sidebar/theme/toast utilities for the **standalone pages only** (`brands`, `suppliers`, `fulfillment`). `index.html` does NOT include this file — it defines the same helpers inline in `script.js`. |
| `brands.html` / `brands.js` | Your Brands standalone page. Manages `billhive-brands` in localStorage. |
| `suppliers.html` / `suppliers.js` | Suppliers standalone page. Manages `billhive-suppliers` in localStorage. |
| `fulfillment.html` / `fulfillment.js` | Fulfillment standalone page. Reads items + suppliers, manages `billhive-purchase-orders`. |
| `catalogue.html` / `catalogue.js` | Catalogue standalone page. Read-only: reads `billhive-items`, `billhive-brands`, `billhive-company`, `billhive-settings`. Groups items by brand, supports search/brand-filter, and prints a full A4-style catalogue document (separate from the thermal receipt print path). |
| `manifest.json` | PWA web app manifest. |
| `sw.js` | Service worker — cache-first strategy for offline support. Cache name `billhive-v2.2`. |
| `icon-192.png` / `icon-512.png` | PWA icons. |
| `favicon.svg` | Browser tab icon (SVG). |
| `README.md` | End-user documentation. |
| `CONTEXT.md` | This file — developer/AI technical map. |

---

## AppState (script.js)

The single source of truth for `index.html`. Declared at the top of `script.js`:

```js
const AppState = {
    lineItems: [],          // Line items on the current bill being created
    currentPage: '',        // Which SPA page is active
    paymentMode: 'cash',    // Selected payment mode for the current bill
    invoiceCount: {},       // { '2607': 5 } — counters per yyMM key
    companyData: { name, gst, address, phone, email, logo },
    settings: { thankYouMessages, termsConditions, currencySymbol },
    config: { dbProvider, apiUrl, apiKey, syncEnabled },
    items: [],              // Product/service catalog
    stockLog: [],           // Stock movement history
    savedBills: [],         // All saved invoices
    salesReturns: []        // All processed returns
}
```

**Standalone pages** (`brands.js`, `suppliers.js`, `fulfillment.js`) do NOT use AppState — they maintain their own module-level arrays and read/write localStorage directly.

---

## localStorage keys

| Key | Type | Owner |
|---|---|---|
| `billhive-company` | Object | `script.js` |
| `billhive-settings` | Object | `script.js` |
| `billhive-config` | Object | `script.js` |
| `billhive-items` | Array | `script.js` (also read by `fulfillment.js`) |
| `billhive-stocklog` | Array | `script.js` (also written by `fulfillment.js`) |
| `billhive-bills` | Array | `script.js` |
| `billhive-returns` | Array | `script.js` |
| `billhive-brands` | Array | `brands.js` |
| `billhive-suppliers` | Array | `suppliers.js` |
| `billhive-purchase-orders` | Array | `fulfillment.js` |
| `billhive-meta` | Object | `script.js` — invoice number counters |
| `billhive-theme` | String | `script.js` + `chrome.js` |

---

## Item object schema (billhive-items)

Each item in the catalog has the following shape (as of v2.2):

```js
{
    id: Number,           // Auto-incremented integer
    name: String,         // Required — display name, used as datalist key
    sku: String,          // Optional — SKU code
    ean: String,          // Optional — EAN / barcode
    itemNumber: String,   // Optional — internal item number
    brand: String,        // Optional — brand name (matches billhive-brands names)
    cost: Number,         // Optional — purchase/cost price
    price: Number,        // Selling price
    discount: Number,     // Default discount % applied to line items
    tax: Number,          // Tax % applied to line items
    stock: Number,        // Current stock level (if trackStock === true)
    trackStock: Boolean   // Whether stock deduction is active for this item
}
```

> **Note:** Legacy items saved before v2.2 will have `sku`, `ean`, `itemNumber`, `brand`, and `cost` as `undefined`. Always use `item.sku || ''` style fallbacks when reading these fields.

---

## Bill object schema (billhive-bills)

```js
{
    id: Number,
    invoiceNo: String,        // e.g. "260701"
    invoiceDate: String,      // ISO date "YYYY-MM-DD"
    dueDate: String,
    customerName: String,
    customerContact: String,
    deliveryAddress: String,
    lineItems: [
        {
            id, name, qty, price, discount, tax,
            total, discountAmount, taxAmount, amountBeforeDiscount
        }
    ],
    billAmount: Number,       // Sum of (qty × price) before discount/tax
    discountAmount: Number,
    taxAmount: Number,
    grandTotal: Number,
    dueAmount: Number,
    paymentMode: String,      // 'cash' | 'card' | 'bank' | 'upi'
    notes: String,
    createdAt: String         // ISO datetime
}
```

---

## Page navigation (index.html)

Navigation is handled by `navigateTo(page)` in `script.js`:

1. Updates `AppState.currentPage`
2. Toggles `.active` on `.sidebar-link[data-page]`
3. Shows `#page-{page}`, hides all others
4. Updates `location.hash` for deep-linking
5. Calls the page's render function if needed

**Available page IDs:** `create-bill`, `past-bills`, `items`, `stock`, `sales-return`, `sale-summary`, `your-data`, `settings`.

To add a new page: add a `<section id="page-{name}">` in `index.html`, add a sidebar `<a>` with `data-page="{name}"`, add the `onclick="navigateTo('{name}')"`, and add a render call inside `navigateTo()`.

---

## Sale Summary (v2.2)

`renderSaleSummary()` in `script.js` computes and renders:

- **Gross sales** — Today, This Week, This Month, All-Time (sum of `grandTotal` on saved bills)
- **Net Sales Today** — Today's gross minus today's return refunds
- **Net Sales Monthly** — This month's gross minus this month's return refunds
- **Sales by Brand** — Groups all saved bill line items by their catalog item's `brand` field, sums revenue, calculates percentage share. Items not in the catalog or with no brand show as "Unbranded". Rendered into `#summary-brand-section`.
- **Top Selling Items** — Top 8 items by total revenue across all bills. Rendered into `#summary-top-items`.

---

## Items page (v2.2)

- **Table columns:** Name, SKU, Brand, Price, Cost, Disc %, Tax %, Stock, Actions
- **Add/Edit modal fields:** Name, SKU Code, EAN/Barcode, Item Number, Brand (autocomplete from `billhive-brands`), Cost, Price, Discount %, Tax %, Opening Stock, Track Stock toggle
- `openItemModal()` calls `populateBrandsDatalist()` to fill `<datalist id="brands-datalist">` from localStorage
- On small screens (`max-width: 640px`), SKU, Brand, and Cost columns are hidden via CSS

---

## PWA (v2.2)

- **`manifest.json`** — `start_url: /index.html`, display: standalone, two shortcuts (Create Bill, Sale Summary)
- **`sw.js`** — Cache name `billhive-v2.2`. Caches all local assets on install. Cache-first for same-origin; network-first for Google Fonts. Offline fallback returns `index.html` for navigate requests.
- **Install button** — Hidden by default in the sidebar (`id="pwa-install-btn"`). Shown when the browser fires `beforeinstallprompt`. Calls `installPWA()` which triggers the native prompt.
- **`installPWA()` is defined in:**
  - `script.js` — for `index.html`
  - `chrome.js` — for `brands.html`, `suppliers.html`, `fulfillment.html`, `catalogue.html`
- **Service worker registration** — inline `<script>` at the bottom of every HTML file registers `sw.js`

---

## Standalone pages (brands, suppliers, fulfillment, catalogue)

Each follows the same pattern:

```
{page}.html  →  loads styles.css, chrome.js, {page}.js
chrome.js    →  provides $(), $$(), escapeHtml(), formatCurrency(),
                showToast(), openSidebar(), closeSidebar(),
                toggleTheme(), initTheme(), loadHeaderCompanyLogo(),
                installPWA() — and calls initChrome() on DOMContentLoaded
{page}.js    →  page-specific state array + CRUD functions,
                calls its own load function on DOMContentLoaded
```

---

## CSS conventions

All CSS is in `styles.css`. CSS custom properties are defined on `:root` (light mode) and overridden on `.dark-mode`. Key variables:

```css
--bg-primary, --bg-secondary, --bg-card, --bg-input
--text-primary, --text-secondary, --text-muted
--border-color, --border-focus
--accent-primary, --accent-danger, --accent-secondary, --accent-warning, --accent-info
--radius-sm, --radius-md, --radius-lg
--sidebar-width (280px), --header-height (64px), --footer-height (60px)
```

**Utility classes used frequently:** `.form-group`, `.form-grid`, `.full-width`, `.modal`, `.modal.active`, `.bill-section`, `.section-header`, `.action-btn`, `.btn-save`, `.btn-clear`, `.btn-danger`, `.icon-btn`, `.icon-btn-danger`, `.stat-card`, `.stat-card-highlight`, `.top-item-row`, `.top-item-bar`, `.top-item-bar-brand`, `.pwa-install-btn`, `.data-table`, `.table-wrap`, `.placeholder-content`, `.status-pill`, `.status-ok`, `.status-low`, `.toast`, `.toast.show`.

---

## Conventions and gotchas

1. **No `<form>` tags.** Never add them — they cause unexpected submits and page reloads.
2. **`$()` and `$$()` are local shortcuts** for `querySelector`/`querySelectorAll`. They are defined at the top of both `script.js` and `chrome.js`. Do not redefine them.
3. **`escapeHtml()`** must be used whenever user-supplied strings are injected into `.innerHTML`. Missing it is an XSS risk.
4. **Stock deduction happens in `saveBill()`** — it iterates `lineItems`, looks up each item by name in `AppState.items`, deducts qty, and logs the movement. If `trackStock === false`, the item is skipped.
5. **Invoice numbering** — `generateInvoiceNumber()` mutates `AppState.invoiceCount` and immediately calls `saveInvoiceMeta()`. It must only be called once per bill creation — it is called in `init()` and again in `resetBillFormForNext()`.
6. **Standalone pages do not import `script.js`** — do not add cross-page function calls. Share data only via `localStorage`.
7. **Service worker cache name** — if you change any static asset, bump the cache name in `sw.js` (`const CACHE_NAME = 'billhive-vX.X'`) so old caches are invalidated on the next visit.
8. **PWA icons** — `icon-192.png` and `icon-512.png` must exist at the project root for the install prompt to work correctly in Chrome.
9. **The sidebar `#pwa-install-btn` starts hidden** (`style="display:none"`). It is shown only when `beforeinstallprompt` fires. If it's always visible something is wrong.
10. **`billhive-items` is read by `fulfillment.js`** as `FItems`. If you change the item schema, check `fulfillment.js` for compatibility.

---

## Adding a feature — checklist

- [ ] Is it a new page? Add section to `index.html`, link in sidebar (all 5 HTML files), add to `navigateTo()`.
- [ ] New localStorage key? Add to the key table in `README.md` and this file. Include in `exportAllData()` and `importAllData()` in `script.js`. Include in `resetAllData()`.
- [ ] New item field? Update: item modal HTML in `index.html`, `openItemModal()`, `saveItemForm()`, `renderItemsTable()`, and the item schema section of this file. Check `fulfillment.js` if it reads items.
- [ ] New CSS? Add to `styles.css` under the `/* v2.x ADDITIONS */` comment block at the bottom. Use existing custom properties — don't hardcode colors.
- [ ] Changed a static file? Bump `CACHE_NAME` in `sw.js`.

---

## Version history

| Version | Changes |
|---|---|
| v1.0 | Initial release — billing, past bills, items, stock, sales return, sale summary, brands, suppliers, fulfillment, your data, settings, dark/light mode. |
| v2.2 | **Net Sales Today & Monthly** added to Sale Summary. **Sales by Brand** section added to Sale Summary. **Item fields expanded**: SKU, EAN, Item Number, Brand, Cost. **PWA**: `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, install button in sidebar, SW registration on all pages. `favicon.svg` added. |
| v2.3 | **Item search**: replaced the unreliable native `<datalist>` popup on the Create Bill line-item name field with a custom-built, theme-aware suggestion dropdown (`handleItemNameInput`/`selectItemSuggestion`/`hideItemSuggestions` in `script.js`). **Print**: thermal receipt output now uses much bolder/heavier font weights and thicker dividers. **Toast**: restyled to use `--accent-primary` with a soft fade+scale transition. **Modals**: `.modal-body` now has real padding app-wide (was `padding:0`), fixing cramped popups everywhere including Adjust Stock; preview modal opts back out since its receipt content has its own padding. **Sales Return**: invoices with every line item already fully returned are excluded from the invoice picker; per-item "Remaining Qty" is now shown and return quantity is capped to what hasn't already been returned; added spacing between the invoice picker, items table, and refund summary. **Adjust Stock**: added a "Don't add to inventory" checkbox that logs the quantity as damaged stock in the stock log without changing the item's stock count. **Header**: added the Bill-Hive brand icon (`favicon.svg`) to the left of the header on all 4 pages, company logo stays centered, menu button stays on the right. |
| v2.4 | **PWA install fix**: `icon-192.png`/`icon-512.png` were referenced in `manifest.json` but never actually existed, so Chrome silently refused to fire `beforeinstallprompt`. Real icons generated from `favicon.svg` and added. **Print Setup** (Settings page): font weight (Normal/Bold/Extra Bold) and paper size (58mm/80mm) are now configurable via CSS custom properties (`--pw-base`, `--pw-strong`, `--pw-size`) set on the `.pos-bill` wrapper in `generatePOSBillHTML()`, read by both the on-screen preview (`styles.css`) and the print popup (`printBill()`'s inline `<style>`). Added "Preview Dummy Bill" / "Print Dummy Bill" using `getDummyBillData()`. **Logo now always prints/previews in black & white** via a `grayscale(100%) contrast(1.15)` filter on `.pos-logo`. |
| v2.5 | **Catalogue page** (`catalogue.html`/`catalogue.js`) — new standalone page following the brands/suppliers/fulfillment pattern. Read-only browse view of `billhive-items` grouped by `billhive-brands`, with search + brand filter, and a "Print Catalogue" button that opens a separate full-page (not thermal-receipt) print layout with the company logo in black & white. Sidebar link added to all 5 HTML pages. **Excel import for Items**: `script.js` now loads SheetJS (`xlsx.full.min.js` via CDN) on `index.html`. Items page has "Download Template" (generates a sample `.xlsx` with the exact expected columns) and "Import Excel" buttons. Import matches columns by header name (`Name`, `SKU`, `EAN`, `Item Number`, `Brand`, `Cost`, `Price`, `Discount %`, `Tax %`, `Opening Stock`, `Track Stock (Y/N)`), and any `Brand` value not already in `billhive-brands` is auto-created there. |