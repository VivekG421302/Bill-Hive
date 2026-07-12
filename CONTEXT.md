# Bill-Hive — Technical Context

> **For AI assistants and new developers picking this project up.**  
> Read this before touching any code. It tells you what every file does, where every feature lives, and the conventions you must follow to avoid breaking things.

---

## Project at a glance

Bill-Hive is a **vanilla HTML/CSS/JS POS billing app** — no build step, no framework, no server. Everything runs in the browser. Data is stored in **IndexedDB** (with a one-time automatic migration from an older `localStorage`-based version — see § IndexedDB stores). It is also a **PWA** (Progressive Web App) installable on desktop and mobile via Chrome/Edge.

- **Entry point:** `index.html` — the main SPA shell. All core billing pages are sections inside this single file, toggled by `navigateTo(page)`.
- **Standalone pages:** `brands.html`, `suppliers.html`, `fulfillment.html`, `catalogue.html` — separate, **self-contained** HTML documents (see architecture note in § File map) that duplicate `styles.css` and `chrome.js` inline rather than linking them.
- **No `<form>` tags are used** (they would trigger browser validation and page reloads). All inputs use event handlers (`onclick`, `onchange`, `oninput`).

> **Current work status:** see `prompt.md` in the project root for the full 3-part feature
> work plan. **Part 1 (shared chrome/theming/settings infrastructure) is complete**,
> including a v4.02.1 bug-fix pass. **Part 2 (Items & Catalogue domain) is complete as of
> v4.03.0.** **Part 3 (Billing/Suppliers/Fulfillment domain) is complete as of v4.04.0.**

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
        screensaver: { enabled: false, seconds: 30 }  // v4.02.1 Part 1 fix
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

Each item in the catalog has the following shape (as of v4.03.0):

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
    trackStock: Boolean,  // Whether stock deduction is active for this item
    images: [String]      // v4.03.0 — up to 4 base64 data URLs, same 2MB-per-image
                           // limit as brand logos (handleBrandLogoUpload). Optional;
                           // legacy items simply have no `images` key or `[]`.
}
```

> **Deletion rule (v4.03.0):** an item cannot be deleted while `trackStock !== false`
> and `stock > 0` — `deleteItem()` blocks it with a toast ("Reduce stock to 0 via
> Stock Adjustment before deleting"). Untracked items (`trackStock === false`) can
> always be deleted regardless of the `stock` value.

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

## Items page (v4.03.0 — Part 2)

- **Table columns:** Name, SKU, Brand, Price, Cost, Disc %, Tax %, Stock, Actions — column-visibility picker (`items-table` in `TABLE_COLUMNS`, `script.js`) predates Part 2 and is unchanged.
- **Add/Edit modal fields:** Name, SKU Code, EAN/Barcode, Item Number, Brand (autocomplete from `billhive-brands`), Cost, Price, Discount %, Tax %, Opening Stock, Track Stock toggle, **Product Images** (v4.03.0 — up to 4 slots, click-to-upload/click-to-replace, `#item-image-grid` + `renderItemImageSlots()`/`handleItemImageUpload()`/`removeItemImage()`, module-level `itemFormImages` array mirrors `brandFormLogoData`'s pattern but as an array).
- `openItemModal()` calls `populateBrandsDatalist()` to fill `<datalist id="brands-datalist">`, and now also fully repopulates `sku`/`ean`/`itemNumber`/`brand`/`cost` on edit (v4.03.0 bug fix — these fields were silently left blank on every edit before this pass, even though `saveItemForm()` always saved them).
- On small screens (`max-width: 640px`), SKU, Brand, and Cost columns are still hidden via CSS as a baseline; the column-visibility picker is the primary mechanism going forward.
- **Row-click-to-view (v4.03.0 Part 2):** clicking a row (outside its Edit/Delete icons) opens `#item-view-modal` via `viewItem(id)`, following the `#brand-view-modal`/`viewBrand()` reference pattern — `.view-action-bar` with Edit/Delete, a small `.item-view-images` thumbnail strip, then `.view-detail-row` fields. `editItemFromView()`/`deleteItemFromView()` close the view and delegate to `openItemModal()`/`deleteItem()`.
- **Delete restriction (v4.03.0 Part 2):** `deleteItem()` now blocks deletion with a toast when `trackStock !== false && stock > 0` ("Reduce stock to 0 via Stock Adjustment before deleting"). Untracked items delete freely. Applies whether triggered from the table row or the view modal.

---

## Catalogue page (v4.03.0 — Part 2)

- Read-only, grouped-by-brand browse view (unchanged base behavior from v2.5) plus a new **product page** interface: clicking any item row (outside its cells' plain text) opens `#product-view-modal` via `viewProduct(id)`, an e-commerce-style detail view showing name, brand, SKU, EAN, item number, price, tax %, and current available stock.
- **Image gallery:** up to 4 images (`item.images`) with a main image, previous/next arrow buttons (desktop), dot navigation, and touch swipe (`touchstart`/`touchend` on `#product-gallery-main`, ~40px swipe threshold) — `renderProductGallery()`/`galleryStep()`/`galleryGoto()`, state in module-level `productGalleryImages`/`productGalleryIndex`. Items with no images show a placeholder icon instead of an empty gallery.
- Row-click wiring follows the same `makeRowClickable()` pattern as Brands/Suppliers/Items — added to `renderCatalogue()`'s per-brand `<table>` output (`data-item-id` on each `<tr>`).
- `catalogue-table`'s column-visibility picker (`colHidden()`) is unchanged by this work.

---

## Supplier object schema (billhive-suppliers) — v4.04.0

```js
{
    id: Number,             // Auto-incremented integer
    name: String,           // Required — company/supplier name
    contactPerson: String,  // Optional
    phone: String,          // Optional
    email: String,          // Optional
    address: String,        // Optional
    itemsSupplied: String,  // Free-text field — kept for backward compatibility
    itemIds: [Number],      // v4.04.0 — linked catalogue item IDs (optional; legacy suppliers have [] or undefined)
    notes: String           // Optional
}
```

> `itemIds` is stored alongside the legacy `itemsSupplied` free-text field for backward compatibility. `suppliers.html` loads `items` from IndexedDB into `SItems` to drive the catalogue item linker picker.

---

## Past Bills page (v4.04.0 — Part 3)

- **Date filter bar:** 6 quick-filter buttons (All / Today / This Week / This Month / This Year / Custom) rendered above the table via `.bills-filter-bar`. State is in `billsDateFilter` (module-level string). `setBillsDateFilter(filter)` updates state, toggles `.active` class, and re-renders. Custom mode shows a from/to date pair (`#bills-date-from`/`#bills-date-to`). Filter combines with the existing search box.
- **Date-wise row separation:** `renderPastBills()` injects `<tr class="bills-date-separator">` rows between date groups (Today / Yesterday / older entries grouped by invoice date). The separator row spans all 6 columns.
- **Row-click-to-view (v4.04.0):** each row carries `data-bill-id` and is wired with `makeRowClickable()` to open `#bill-view-modal` via `openBillViewModal(id)`. Inline icon buttons get `event.stopPropagation()`.
- **Bill view modal (`#bill-view-modal`):** shows a `.view-action-bar` with Preview / Print / Delete, then `.view-detail-row` fields (invoice no, date, customer, contact, payment, total, items, notes). Preview opens the existing `#preview-modal` with `generatePOSBillHTML()`. Print calls `printBill()`. Delete calls `deletePastBill()` after closing the view.

---

## Sales Return page (v4.04.0 — Part 3)

- **Damaged stock checkbox (`#return-damaged-stock`):** rendered inside `#return-summary` as a `.return-damaged-row` label. When checked, `processSalesReturn()` does NOT restock the item; instead it logs two stock movements for each returned tracked item — a Sales Return entry (positive) and an immediate Damaged entry (negative) — so the net stock effect is zero but both are visible in the stock log. Matches the convention established by Adjust Stock's "Don't add to inventory" checkbox (v2.3). The `damagedStock` boolean is also stored on the return record.
- Checkbox is reset to unchecked after every successful return.

---

## Fulfillment page (v4.04.0 — Part 3)

- **PO row-click:** `renderPOTable()` now attaches `makeRowClickable()` to each `<tr data-po-id>`, replacing the previous inline `onclick` attribute. Icon buttons retain `event.stopPropagation()`.
- **PO view action bar:** `viewPO()` now renders a `.view-action-bar` at the top of `#po-modal-body` with Mark-as-next-status / Print / Delete buttons (moved from the bottom inline layout). `printPOFromModal(id)` opens a `window.open` print document.
- **Supplier filter on restock table:** a second `<select id="restock-supplier-filter">` in the form-grid filters the low-stock items to only those linked to the chosen supplier's `itemIds`. Selecting a supplier also auto-fills `#po-supplier-select` if it is empty. Only suppliers with at least one linked item appear in the filter.

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
default `'right'`) is applied via `applySidebarSide(side)`, which sets
`order` on `.header-left`/`.header-center`/`.header-right` (3/2/1 when
`side-left`, vs. their natural DOM order 1/2/3 otherwise) via a
`body.side-left` selector in `styles.css`. **Important:** `.app-header` is
a **CSS Grid** container (`display:grid; grid-template-columns: 40px 1fr
40px;`), not flex — `flex-direction` has no effect on it. Use `order` (grid
items honor `order` the same way flex items do) for any future header
reordering. Changed only from `index.html`'s Settings page; standalone
pages just apply whatever was saved (`applySavedUiPrefs()` in `chrome.js`,
called from `initChrome()`).

**Accent color.** `AppState.settings.accentColor` (hex string, empty =
theme default) is applied via `applyAccentColor(hex)`, which overrides the
`--accent-primary`/`--accent-primary-hover` CSS custom properties as an
**inline style on `document.body`** — not `document.documentElement`.
This matters: `.dark-mode` (also applied to `body` — see
`toggleTheme()`/`initTheme()`) declares its own `--accent-primary` value,
and a class-based rule on an element always beats an inline-style override
set on an *ancestor* of that element. Setting the override on `html`
instead of `body` was the v4.02.0 bug that made the accent picker silently
no-op in dark mode — it worked in light mode only because `:root`'s
default value has no competing `.dark-mode`-scoped override sitting closer
to the affected elements. Every logo mark that should re-tint with the
accent color must use `color: var(--accent-primary)` on a container plus
`stroke="currentColor"`/`fill="currentColor"` on its SVG paths — this is
now true of `.sidebar-logo`, `.footer-logo`, `.header-brand-icon` (as of
v4.02.1, an inline `<svg>` — see below) and `.logo-placeholder`.

**Screen saver.** `AppState.settings.screensaver = { enabled, seconds }`
(renamed from `minutes` in v4.02.1 — a per-second idle timeout is far more
testable and, per user feedback, was the expected unit). Default 30
seconds, range 5–3600 in the Settings UI. `initScreensaver(enabled,
seconds)` wires up idle listeners (`mousemove`/`mousedown`/`keydown`/
`touchstart`/`scroll`) that show/hide `#screensaver-overlay` (present on
all 5 HTML files) and resets/dismisses on any of those events. The
listeners are bound exactly once (`screensaverListenersBound` guard) —
v4.02.0 called `initScreensaver()` from both `loadSettings()` and every
`saveSettings()`, silently stacking duplicate `document.addEventListener`
calls on every settings save (harmless but wasteful; fixed in v4.02.1).

**Header / footer brand icon consistency (v4.02.1).** The small
"Bill-Hive" brand mark that appears in the sidebar header
(`.sidebar-logo`), the main header (`.header-brand-icon`, top-left/right
depending on menu position), and the footer (`.footer-logo`) is the same
inline hexagon "document" SVG in all three places, each wrapped so
`color: var(--accent-primary)` re-tints it via `currentColor`. This is
**separate from the company logo** (`#header-logo`/`#header-logo-placeholder`
in `.header-center`, set on the Your Data page) — the brand mark does not
change when a company logo is uploaded. v4.02.0 had two bugs here: the
header brand icon was `<img src="favicon.svg">` (a flat raster/vector
image, not accent-tintable), and the footer was wired to mirror the
uploaded *company* logo instead of staying the fixed Bill-Hive brand mark —
both are fixed as of v4.02.1. `favicon.svg` itself is unchanged and still
used only for the actual browser tab icon / PWA icon, not inline in the
page.

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
| v4.02.0 | **(Part 1 — "Shared Chrome, Theming & Settings Infrastructure".)** Menu Position, App Logo Consistency, row-click-to-open pattern + view action bars (reference: Brands, Suppliers), scroll/drag optimization, responsive fixes, border-filled Settings buttons, accent color picker, screen saver, type-to-confirm Erase All Data. Cache bumped to `billhive-v4.02`. |
| v4.02.1 | **(Bug-fix pass on v4.02.0, driven by user testing feedback.)** **Accent color in dark mode**: fixed — `applyAccentColor()` now overrides `--accent-primary` as an inline style on `document.body` instead of `document.documentElement`, so it actually wins over `.dark-mode`'s own value (see § Shared conventions for the full explanation). **Menu Position**: fixed — `.app-header` is a CSS Grid, not flexbox, so the old `flex-direction: row-reverse` approach silently did nothing; now uses `order` on `.header-left`/`.header-center`/`.header-right`. **Screen saver**: switched from minutes to **seconds** (default 30, range 5–3600) for realistic testability, and fixed a duplicate-event-listener bug where every "Save Settings" click re-registered a fresh set of idle listeners. **Header/footer brand icon**: both now render the same inline hexagon SVG as the sidebar logo (accent-color tintable via `currentColor`), instead of the header using a static `favicon.svg` `<img>` and the footer mirroring the *uploaded company logo* (which was the wrong element to mirror — the small brand mark is intentionally independent of the company logo, which still only appears in the header center). Cache bumped to `billhive-v4.02.1`. |
| v4.03.0 | **(Part 2 — "Items & Catalogue Domain".)** **Item delete restriction**: `deleteItem()` blocks deleting a tracked item while `stock > 0`, with an explanatory toast; untracked items delete freely. **Row-click-to-view on Items**: `#item-view-modal`/`viewItem()`, following the Brands/Suppliers reference pattern, with Edit/Delete in a `.view-action-bar`. **Item images**: item schema gains `images: []` (up to 4 base64 data URLs, 2MB-each limit, same convention as brand logos); Add/Edit modal gets a 4-slot click-to-upload/replace grid (`renderItemImageSlots()`); the item view modal and the Catalogue product page both display them. **Item modal edit bug fix**: `openItemModal()` now actually repopulates `sku`/`ean`/`itemNumber`/`brand`/`cost` when editing (previously always blank on edit despite being saved correctly). **Catalogue product page**: clicking a catalogue row opens an e-commerce-style product view (`#product-view-modal`/`viewProduct()`) with name/brand/SKU/EAN/item number/price/tax/available stock and an image gallery supporting arrow clicks, dot navigation, and touch swipe. Column-visibility and print behavior on Items/Catalogue are unchanged. Cache bumped to `billhive-v4.03.0`. |
| v4.04.0 | **(Part 3 — "Billing, Sales Return, Suppliers & Fulfillment Domain".)** **Sales Return damaged stock**: added "Don't add to inventory (log as damaged stock)" checkbox (`#return-damaged-stock`) — when checked, two stock-log entries are created (Sales Return + Damaged), net effect zero, matching the Adjust Stock convention. **Sale Summary layout fix**: CSS bug where "Sales by Brand" and "Top Selling Items" cards merged visually — fixed by adding `margin-top: 16px` between consecutive `.bill-section` cards inside `#page-sale-summary`. **Past Bills date filtering & separation**: date-range filter bar (All/Today/This Week/This Month/This Year/Custom) combining with search; date-wise row separators (Today/Yesterday/date groups) injected into the table body. **Past Bills row-click + view modal**: `#bill-view-modal`/`openBillViewModal()` — `.view-action-bar` with Preview/Print/Delete; Preview reuses `#preview-modal`/`generatePOSBillHTML()`. **PO row-click & view action bar**: `renderPOTable()` uses `makeRowClickable()` (replaces inline `onclick`); `viewPO()` now shows a `.view-action-bar` with Mark/Print/Delete at the top; `printPOFromModal()` added. **Supplier catalogue management**: supplier schema gains `itemIds: [Number]`; `suppliers.html` loads `items` into `SItems`; supplier modal gets a catalogue item linker (picker + tag chips); `viewSupplier()` shows linked item names; fulfillment's restock table adds `#restock-supplier-filter` to filter low-stock items by supplier's `itemIds` and auto-fills the PO supplier select. Cache bumped to `billhive-v4.04.0`. |

---

## Adding a feature — checklist

- [ ] Is it a new page? Add section to `index.html`, link in sidebar (all 5 HTML files), add to `navigateTo()`.
- [ ] New IndexedDB store/key? Add to the schema section in `README.md` and this file. Include in `exportAllData()`/`importAllData()`/`resetAllData()` in `script.js`, and in `dbClearAll()`'s `STORE_NAMES` if it's a new store (bump `DB_VERSION` in both `script.js` and `chrome.js`, and mirror into every standalone page's inline chrome block per § Standalone pages).
- [ ] New item field? Update: item modal HTML in `index.html`, `openItemModal()`, `saveItemForm()`, `renderItemsTable()`, and the item schema section of this file. Check `fulfillment.html`'s page-specific script (not `fulfillment.js` — see § File map) if it reads items.
- [ ] New CSS? Add to `styles.css` under the newest `/* vX.XX ADDITIONS */` comment block at the bottom, then mirror into all 4 standalone pages' inline `<style>` block. Use existing custom properties — don't hardcode colors.
- [ ] New table with rows to click / columns to configure? Reuse the patterns in § Shared conventions for Part 2 / Part 3 — don't write new ones.
- [ ] Changed a static file? Bump `CACHE_NAME` in `sw.js`.