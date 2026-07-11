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

> **Architecture note (as of v4.02.0):** the standalone pages
> (`brands.html`, `suppliers.html`, `catalogue.html`, `fulfillment.html`) are
> now **self-contained single-file bundles** — each has the entire contents
> of `styles.css` inlined in a `<style>` block and the entire contents of
> `chrome.js` inlined in the first `<script>` block, followed by a second
> `<script>` block with that page's own logic (equivalent to, but ahead of,
> the standalone `brands.js`/`suppliers.js`/`catalogue.js` files below).
> `chrome.js`, `styles.css`, `brands.js`, `suppliers.js`, `catalogue.js` are
> kept as the **maintained source modules** — edit them first, then mirror
> the change into each page's inline copy (see "Keeping inline bundles in
> sync" below). `fulfillment.js` in this repo is a stray duplicate of
> `fulfillment.html`, not a real module — ignore it / don't edit it.
> Also, despite the "localStorage keys" section below, all pages actually
> read/write through the `dbGet`/`dbSet` **IndexedDB** wrapper (see
> `chrome.js`), which auto-migrates any pre-existing `billhive-*`
> `localStorage` keys into IndexedDB the first time it runs. `index.html`
> carries its own copy of the same IndexedDB wrapper at the top of
> `script.js`.

| File | Role |
|---|---|
| `index.html` | Main app shell. Contains all core page sections and modals. |
| `script.js` | All logic for `index.html` — state, rendering, bill CRUD, items, stock, returns, summary, settings, PWA install. Carries its own IndexedDB wrapper (`dbInit`/`dbGet`/`dbSet`, matching `chrome.js`'s). |
| `styles.css` | Shared CSS source-of-truth. Mirror any change into the inline `<style>` block of the 4 standalone pages. CSS custom properties for theming. No preprocessor. |
| `chrome.js` | Shared header/sidebar/theme/toast/IndexedDB/confirm-modal/UI-preference source module for the **standalone pages**. Mirror any change into the first `<script>` block of the 4 standalone pages. `index.html` does NOT include this file — it defines the same helpers inline in `script.js`. |
| `brands.html` | Your Brands standalone page (self-contained bundle — see architecture note above). Manages the `brands` IndexedDB store. |
| `suppliers.html` | Suppliers standalone page (self-contained bundle). Manages the `suppliers` IndexedDB store. Reference implementation of the row-click-to-view pattern and the per-table column-visibility picker (§ Shared conventions below). |
| `fulfillment.html` | Fulfillment standalone page (self-contained bundle). Reads items + suppliers, manages the `purchaseOrders` IndexedDB store. Has its own column-visibility picker for `po-table`. |
| `catalogue.html` | Catalogue standalone page (self-contained bundle). Read-only: reads items, brands, company, settings. Groups items by brand, supports search/brand-filter, prints a full A4-style catalogue document, and has its own column-visibility picker for `catalogue-table` (implemented differently from the others — see that page's script for `colHidden()`). |
| `brands.js` / `suppliers.js` / `catalogue.js` | Source modules mirroring each standalone page's page-specific `<script>` block. Slightly behind the inline bundles as of this writing (they predate the `showConfirm()` custom modal and column-visibility picker) — treat the inline HTML as canonical and backport fixes here when touching a page. |
| `fulfillment.js` | **Not a real module** — a stray duplicate of `fulfillment.html`'s full markup. Do not edit; do not treat as source of truth. |
| `manifest.json` | PWA web app manifest. |
| `sw.js` | Service worker — cache-first strategy for offline support. Bump `CACHE_NAME` whenever any static asset changes. |
| `icon-192.png` / `icon-512.png` | PWA icons. |
| `favicon.svg` | Browser tab icon (SVG). Static brand mark — not tied to the accent-color picker (see § Shared conventions). |
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
    settings: {
        thankYouMessages, termsConditions, currencySymbol,
        print: { fontWeight, paperSize },
        sidebarSide: 'right',           // v4.02.0 Part 1 — 'left' | 'right'
        accentColor: '',                // v4.02.0 Part 1 — hex string, '' = theme default
        screensaver: { enabled: false, minutes: 5 }  // v4.02.0 Part 1
    },
    config: { dbProvider, apiUrl, apiKey, syncEnabled },
    items: [],              // Product/service catalog
    stockLog: [],           // Stock movement history
    savedBills: [],         // All saved invoices
    salesReturns: []        // All processed returns
}
```

`AppState.settings` is dumped/restored wholesale by `exportAllData()`/
`importAllData()`, so any new field added to it (like the three v4.02.0
fields above) is automatically included in backup/restore — no extra
plumbing needed there.

**Standalone pages** do NOT use `AppState` — they maintain their own
module-level arrays (`Brands`, `Suppliers`, etc.) and read/write through
the same `dbGet`/`dbSet` IndexedDB wrapper directly.

---

## IndexedDB stores (formerly "localStorage keys")

As of v4.01.0, all of these live as IndexedDB object stores (database
`billhive-db`) rather than raw `localStorage`, accessed via `dbGet(name)`/
`dbSet(name, value)`. The `localStorage` key names below are kept only as
the one-time migration source (`migrateFromLocalStorage()` in
`chrome.js`/`script.js` copies any that still exist into IndexedDB, then
deletes the `localStorage` copy).

| IndexedDB store | Legacy localStorage key | Type | Owner |
|---|---|---|---|
| `company` | `billhive-company` | Object | `script.js` |
| `settings` | `billhive-settings` | Object | `script.js` — see AppState.settings shape above, includes v4.02.0 `sidebarSide`/`accentColor`/`screensaver` |
| `config` | `billhive-config` | Object | `script.js` |
| `items` | `billhive-items` | Array | `script.js` (also read by `fulfillment.html`'s page script as `FItems`) |
| `stocklog` | `billhive-stocklog` | Array | `script.js` (also written by `fulfillment.html`) |
| `bills` | `billhive-bills` | Array | `script.js` |
| `returns` | `billhive-returns` | Array | `script.js` |
| `brands` | `billhive-brands` | Array | `brands.html` |
| `suppliers` | `billhive-suppliers` | Array | `suppliers.html` |
| `purchaseOrders` | `billhive-purchase-orders` | Array | `fulfillment.html` |
| `meta` | `billhive-meta` | Object | `script.js` — invoice number counters |
| `theme` | `billhive-theme` | String | `script.js` + `chrome.js` |
| `columnVisibility` | *(new in v4.01.0, no legacy key)* | Object | `{ [tableId]: [bool, bool, ...] }`, keyed by table id (`suppliers-table`, `po-table`, `catalogue-table`, ...) — see § Shared conventions for Part 2 / Part 3 |

`STORE_NAMES` in `script.js`/`chrome.js` must list every store above (used
by `dbInit()` to create object stores and by `dbClearAll()` for the erase
flow); `DB_VERSION` must be bumped whenever a store is added.

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

Each is a **self-contained single-file bundle** (see architecture note in
§ File map) that otherwise follows the same logical layering:

```
{page}.html  →  inline <style> (mirrors styles.css) +
                inline <script> #1 (mirrors chrome.js) +
                inline <script> #2 (page-specific, mirrors {page}.js) +
                inline <script> #3 (one-line service-worker registration)
chrome.js    →  provides $(), $$(), escapeHtml(), formatCurrency(),
                showToast(), showConfirm()/closeConfirmModal(),
                openSidebar(), closeSidebar(), toggleTheme(), initTheme(),
                loadHeaderCompanyLogo(), updateHeaderLogo()/updateFooterLogo(),
                applySidebarSide(), applyAccentColor(), initScreensaver(),
                applySavedUiPrefs(), enableDragScroll()/initDragScrollAll(),
                makeRowClickable(), installPWA() — and calls initChrome()
                on DOMContentLoaded, which applies all of the above.
{page}.js    →  page-specific state array + CRUD functions, its own
                view-modal + column-visibility functions where applicable,
                calls its own load function on DOMContentLoaded
```

**Keeping inline bundles in sync:** when you change `styles.css` or
`chrome.js`, copy the same change into the corresponding inline block of
all 4 standalone HTML files. Do **not** wholesale-replace a page's inline
`<script>`/`<style>` block without first checking whether that page has
page-specific additions living inside it — `suppliers.html` and
`fulfillment.html` used to keep their column-visibility code inside the
"chrome" block before v4.02.0; it has since been moved into each page's
own page-specific `<script>` block specifically so that a chrome-block sync
can never silently delete it again. `catalogue.html` keeps a similar but
differently-implemented column-visibility system (`colHidden()`) inside its
own page-specific block too. When mirroring a chrome.js change, always grep
the target page's first `<script>` block for anything not present in
chrome.js before overwriting it.

---

## Shared conventions for Part 2 / Part 3 (v4.02.0 Part 1)

These reusable patterns/helpers were built in v4.02.0 "Part 1" work
specifically so later item/catalogue and billing/supplier/fulfillment work
doesn't reinvent them. Reference implementations: **Brands** and
**Suppliers** pages.

**Row-click-to-open pattern.** Any list row or card can be made clickable
to open a read-only detail/view without interfering with its inner
buttons:
```js
// after rendering rows/cards into the DOM:
tbody.querySelectorAll('tr').forEach((tr, i) => {
    const record = filtered[i];
    if (record) makeRowClickable(tr, () => viewRecord(record.id));
});
```
`makeRowClickable(el, onOpen)` (defined in `script.js` for `index.html`,
`chrome.js` for standalone pages) adds the `.row-clickable` CSS class and
ignores clicks that land on a `button`/`a`/`input`/`select`/`textarea`/
`label` inside the element, so existing icon buttons keep working. Give
inner action buttons `onclick="event.stopPropagation(); ..."` too, as an
extra safety net (see `brands.html`/`suppliers.html`).

**View + top-level action bar.** Each "view" modal/page should show a
`.view-action-bar` (Edit / Delete / Print, plus **Preview** specifically
for invoice/bill views) at the top of the body, followed by read-only
`.view-detail-row` / `.view-detail-label` / `.view-detail-value` rows for
the record's fields:
```html
<div class="view-action-bar">
    <button class="action-btn btn-save" onclick="editXFromView()">Edit</button>
    <button class="action-btn btn-clear" onclick="printXFromView()">Print</button>
    <button class="action-btn" style="background:transparent;border:1.5px solid var(--accent-danger);color:var(--accent-danger);" onclick="deleteXFromView()">Delete</button>
</div>
```
See `#supplier-view-modal` in `suppliers.html` and `#brand-view-modal` in
`brands.html` for full working examples, including a `printXFromView()`
helper that opens a print-friendly `window.open('', '_blank')` document.

**Column-visibility picker.** A per-table "choose visible columns" button
backed by the shared `columnVisibility` IndexedDB store. It's already
wired up for `suppliers-table` (`suppliers.html`) and `po-table`
(`fulfillment.html`); `catalogue.html` has an equivalent but structurally
different version (`colHidden()`, since Catalogue renders one `<table>` per
brand group rather than one big table). To add it to a new table:
1. Add a `TABLE_COLUMNS` entry: `'my-table': ['Col A', 'Col B', ...]`.
2. Add the column-toggle button + `<div class="column-toggle-dropdown" id="my-table-column-dropdown"></div>` next to the table, and give the `<table>` `id="my-table"`.
3. Call `initColumnVisibility('my-table')` after rendering the table body.
4. Reuse the existing `loadColumnVisibility`/`saveColumnVisibility`/`applyColumnVisibility`/`renderColumnToggles`/`toggleColumn`/`toggleColumnDropdown` functions already present in that page's script — don't redeclare `TABLE_COLUMNS` a second time in the same page (it's a `const` at global script scope; a second `<script>` block declaring it again throws `Identifier 'TABLE_COLUMNS' has already been declared`).
On `index.html`, the equivalent system already existed pre-v4.02.0 in
`script.js` (same function names, same `TABLE_COLUMNS` shape).

**Sidebar side.** `AppState.settings.sidebarSide` (`'left'` | `'right'`,
default `'right'`) is applied via `applySidebarSide(side)`, which toggles a
`body.side-left` class read by `styles.css`. Changed only from
`index.html`'s Settings page; standalone pages just apply whatever was
saved (`applySavedUiPrefs()` in `chrome.js`, called from `initChrome()`).

**Accent color.** `AppState.settings.accentColor` (hex string, empty =
theme default) is applied via `applyAccentColor(hex)`, which overrides the
`--accent-primary` (and `--accent-primary-hover`, on `index.html`) CSS
custom property on `document.documentElement`. Every logo mark that should
re-tint with it must use `color: var(--accent-primary)` on a container plus
`stroke="currentColor"`/`fill="currentColor"` on its SVG paths (see
`.sidebar-logo`, `.footer-logo`, `.logo-placeholder` in `styles.css`) — this
already covers the app's own hexagon "document" logo marks. The
`favicon.svg`/`.header-brand-icon` (loaded as an `<img>`) is the fixed
Bill-Hive brand mark and intentionally does **not** re-tint with the
accent color.

**Screen saver.** `AppState.settings.screensaver = { enabled, minutes }`.
`initScreensaver(enabled, minutes)` wires up idle listeners
(`mousemove`/`mousedown`/`keydown`/`touchstart`/`scroll`) that show/hide
`#screensaver-overlay` (present on all 5 HTML files). Any of those events
resets the timer and dismisses the overlay if it's showing.

**Footer logo consistency.** `updateHeaderLogo(logoUrl)` now also calls
`updateFooterLogo(logoUrl)` so `#footer-logo`/`#footer-logo-placeholder`
always mirror `#header-logo`/`#header-logo-placeholder` exactly. Don't call
`updateFooterLogo()` directly from new code — go through
`updateHeaderLogo()` so the two never drift apart again.

**Scroll & drag.** `.table-wrap` elements automatically get drag-to-scroll
via `enableDragScroll()`/`initDragScrollAll()` (called once at
`init()`/`initChrome()` time, since `.table-wrap` containers are static —
only their `tbody` content re-renders). A `.dragging` class disables text
selection for the duration of the drag. If a new page adds its own
`.table-wrap`, call `initDragScrollAll()` again after it's in the DOM (or
call `enableDragScroll(theElement)` directly).

**Erase Data type-to-confirm.** `resetAllData()` on `index.html` now opens
`#erase-confirm-modal` instead of `showConfirm()`; the "Erase Everything"
button stays `disabled` until the user types `delete` (case-insensitive)
into `#erase-confirm-input` (`validateEraseConfirmInput()`). Actual wipe
logic lives in `confirmEraseAllData()`.

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

**Utility classes used frequently:** `.form-group`, `.form-grid`, `.full-width`, `.modal`, `.modal.active`, `.bill-section`, `.section-header`, `.action-btn`, `.btn-save`, `.btn-clear`, `.btn-danger`, `.icon-btn`, `.icon-btn-danger`, `.stat-card`, `.stat-card-highlight`, `.top-item-row`, `.top-item-bar`, `.top-item-bar-brand`, `.pwa-install-btn`, `.data-table`, `.table-wrap`, `.placeholder-content`, `.status-pill`, `.status-ok`, `.status-low`, `.toast`, `.toast.show`, `.row-clickable`, `.view-action-bar`, `.view-detail-row`/`.view-detail-label`/`.view-detail-value`, `.column-toggle-wrap`/`.column-toggle-dropdown`/`.column-toggle-item`, `.col-hidden`.

---

## Conventions and gotchas

1. **No `<form>` tags.** Never add them — they cause unexpected submits and page reloads.
2. **`$()` and `$$()` are local shortcuts** for `querySelector`/`querySelectorAll`. They are defined at the top of both `script.js` and `chrome.js`. Do not redefine them.
3. **`escapeHtml()`** must be used whenever user-supplied strings are injected into `.innerHTML`. Missing it is an XSS risk.
4. **Stock deduction happens in `saveBill()`** — it iterates `lineItems`, looks up each item by name in `AppState.items`, deducts qty, and logs the movement. If `trackStock === false`, the item is skipped.
5. **Invoice numbering** — `generateInvoiceNumber()` mutates `AppState.invoiceCount` and immediately calls `saveInvoiceMeta()`. It must only be called once per bill creation — it is called in `init()` and again in `resetBillFormForNext()`.
6. **Standalone pages do not import `script.js`** — do not add cross-page function calls. Share data only via the `dbGet`/`dbSet` IndexedDB wrapper (see architecture note in § File map — this used to say "localStorage", which is now only the migration fallback).
7. **Service worker cache name** — if you change any static asset, bump the cache name in `sw.js` (`const CACHE_NAME = 'billhive-vX.XX'`) so old caches are invalidated on the next visit.
8. **PWA icons** — `icon-192.png` and `icon-512.png` must exist at the project root for the install prompt to work correctly in Chrome.
9. **The sidebar `#pwa-install-btn` starts hidden** (`style="display:none"`). It is shown only when `beforeinstallprompt` fires. If it's always visible something is wrong.
10. **Items are read by `fulfillment.html`** as `FItems`. If you change the item schema, check `fulfillment.html`'s page-specific script for compatibility (the file named `fulfillment.js` in this repo is a stray duplicate — see § File map — don't check it instead).
11. **`TABLE_COLUMNS` is a `const` at global script scope in each page that has one.** Don't declare it a second time in the same page's other `<script>` block, and don't move it between the "chrome" block and the page-specific block without checking whether it's already used there (see § Standalone pages).
12. **Row-click / view-modal / accent-color / sidebar-side / screensaver / drag-scroll conventions** are documented in § Shared conventions for Part 2 / Part 3 above — reuse those helpers instead of writing new ones.

---

## Version history

| Version | Changes |
|---|---|
| v1.0 | Initial release — billing, past bills, items, stock, sales return, sale summary, brands, suppliers, fulfillment, your data, settings, dark/light mode. |
| v2.2 | **Net Sales Today & Monthly** added to Sale Summary. **Sales by Brand** section added to Sale Summary. **Item fields expanded**: SKU, EAN, Item Number, Brand, Cost. **PWA**: `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, install button in sidebar, SW registration on all pages. `favicon.svg` added. |
| v2.3 | **Item search**: replaced the unreliable native `<datalist>` popup on the Create Bill line-item name field with a custom-built, theme-aware suggestion dropdown (`handleItemNameInput`/`selectItemSuggestion`/`hideItemSuggestions` in `script.js`). **Print**: thermal receipt output now uses much bolder/heavier font weights and thicker dividers. **Toast**: restyled to use `--accent-primary` with a soft fade+scale transition. **Modals**: `.modal-body` now has real padding app-wide (was `padding:0`), fixing cramped popups everywhere including Adjust Stock; preview modal opts back out since its receipt content has its own padding. **Sales Return**: invoices with every line item already fully returned are excluded from the invoice picker; per-item "Remaining Qty" is now shown and return quantity is capped to what hasn't already been returned; added spacing between the invoice picker, items table, and refund summary. **Adjust Stock**: added a "Don't add to inventory" checkbox that logs the quantity as damaged stock in the stock log without changing the item's stock count. **Header**: added the Bill-Hive brand icon (`favicon.svg`) to the left of the header on all 4 pages, company logo stays centered, menu button stays on the right. |
| v2.4 | **PWA install fix**: `icon-192.png`/`icon-512.png` were referenced in `manifest.json` but never actually existed, so Chrome silently refused to fire `beforeinstallprompt`. Real icons generated from `favicon.svg` and added. **Print Setup** (Settings page): font weight (Normal/Bold/Extra Bold) and paper size (58mm/80mm) are now configurable via CSS custom properties (`--pw-base`, `--pw-strong`, `--pw-size`) set on the `.pos-bill` wrapper in `generatePOSBillHTML()`, read by both the on-screen preview (`styles.css`) and the print popup (`printBill()`'s inline `<style>`). Added "Preview Dummy Bill" / "Print Dummy Bill" using `getDummyBillData()`. **Logo now always prints/previews in black & white** via a `grayscale(100%) contrast(1.15)` filter on `.pos-logo`. |
| v2.5 | **Catalogue page** (`catalogue.html`/`catalogue.js`) — new standalone page following the brands/suppliers/fulfillment pattern. Read-only browse view of `billhive-items` grouped by `billhive-brands`, with search + brand filter, and a "Print Catalogue" button that opens a separate full-page (not thermal-receipt) print layout with the company logo in black & white. Sidebar link added to all 5 HTML pages. **Excel import for Items**: `script.js` now loads SheetJS (`xlsx.full.min.js` via CDN) on `index.html`. Items page has "Download Template" (generates a sample `.xlsx` with the exact expected columns) and "Import Excel" buttons. Import matches columns by header name (`Name`, `SKU`, `EAN`, `Item Number`, `Brand`, `Cost`, `Price`, `Discount %`, `Tax %`, `Opening Stock`, `Track Stock (Y/N)`), and any `Brand` value not already in `billhive-brands` is auto-created there. |
| v4.01.0 | *(Reconstructed from code archaeology — no changelog entry existed for this version before now.)* Storage backend switched from raw `localStorage` to an **IndexedDB** wrapper (`dbInit`/`dbGet`/`dbSet`/`dbRemove`/`dbClearAll`) with one-time auto-migration of existing `billhive-*` `localStorage` keys, added to both `script.js` and `chrome.js`. The 4 standalone pages became **self-contained single-file bundles** (styles.css + chrome.js + page script all inlined) rather than linking external files. Custom `showConfirm()`/`closeConfirmModal()` modal added, replacing native `confirm()` calls app-wide. Column-visibility picker ("Task 7") added for `suppliers-table`, `po-table`, and (differently) `catalogue-table`. PO journey/status timeline UI added to Fulfillment. Header/footer edge-fade and misc CSS polish. |
| v4.02.0 | **(This work — "Part 1: Shared Chrome, Theming & Settings Infrastructure".)** **Menu Position**: Settings → choose left/right sidebar + header layout (`applySidebarSide()`, `body.side-left`). **App Logo Consistency**: footer logo now mirrors the header logo exactly (`updateFooterLogo()`, always called from `updateHeaderLogo()`) on all 5 pages. **Row-click-to-open pattern** (`makeRowClickable()`) + top-level view action bars (`.view-action-bar`) established and applied as a reference implementation to the Brands and Suppliers pages (`#brand-view-modal`, `#supplier-view-modal`). **Scroll & drag optimization**: `.table-wrap` elements gained mouse drag-to-scroll (`enableDragScroll()`) without triggering text selection. **Responsive fixes**: action-bar buttons now wrap instead of disappearing under 480px. **Settings buttons restyled** to a border-filled, hover-swaps-fill style (`#page-settings .action-btn`/`.import-btn`). **Accent color picker** added to Settings (`applyAccentColor()`, re-tints buttons/links/logo marks via `--accent-primary`, included in Export/Import automatically since it lives on `AppState.settings`). **Screen saver** setting added (`initScreensaver()`, idle overlay dismissed by any click/key). **Erase All Data** now requires typing "delete" into `#erase-confirm-modal` instead of a double `confirm()`. Service worker cache bumped to `billhive-v4.02`. |

---

## Adding a feature — checklist

- [ ] Is it a new page? Add section to `index.html`, link in sidebar (all 5 HTML files), add to `navigateTo()`.
- [ ] New IndexedDB store/key? Add to the schema section in `README.md` and this file. Include in `exportAllData()`/`importAllData()`/`resetAllData()` in `script.js`, and in `dbClearAll()`'s `STORE_NAMES` if it's a new store (bump `DB_VERSION` in both `script.js` and `chrome.js`, and mirror into every standalone page's inline chrome block per § Standalone pages).
- [ ] New item field? Update: item modal HTML in `index.html`, `openItemModal()`, `saveItemForm()`, `renderItemsTable()`, and the item schema section of this file. Check `fulfillment.html`'s page-specific script (not `fulfillment.js` — see § File map) if it reads items.
- [ ] New CSS? Add to `styles.css` under the newest `/* vX.XX ADDITIONS */` comment block at the bottom, then mirror into all 4 standalone pages' inline `<style>` block. Use existing custom properties — don't hardcode colors.
- [ ] New table with rows to click / columns to configure? Reuse the patterns in § Shared conventions for Part 2 / Part 3 — don't write new ones.
- [ ] Changed a static file? Bump `CACHE_NAME` in `sw.js`.