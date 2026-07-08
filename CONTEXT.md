# CONTEXT.md — for any AI (or dev) picking this project up

Read this before making changes. It explains what Bill-Hive is, how the code is organized, and what decisions were made, so you don't have to reverse-engineer it.

## What this is

Bill-Hive is a single-page, offline-first, mobile-first POS billing app. Three files, no build tools, no framework, no backend:

- `index.html` — all markup for every "page" (they're `<section class="page">` blocks toggled via JS, not real routes/URLs).
- `styles.css` — all styling. Uses CSS custom properties (`:root` + `.dark-mode` overrides) for full theming.
- `script.js` — all logic. One global `AppState` object + a big collection of top-level functions. No modules/bundler — everything is loaded via a single `<script src="script.js">` at the end of `<body>`.

There is no server. All persistence is `localStorage`, namespaced with `billhive-*` keys (see README.md for the full key list).

## Why it's built this way

The original ask was explicitly: single static app, no seeded data, everything JSON-exportable, mobile-first, POS-receipt-style printing, a right-hand sidebar (not a top navbar), dark mode, and a places-for-later "config page" for a future real database. All of that shaped the architecture below.

## Page/routing model

`navigateTo(pageName)` in `script.js`:
1. Sets `AppState.currentPage`.
2. Toggles `.active` on the matching `#page-<pageName>` section and the matching `.sidebar-link[data-page="<pageName>"]`.
3. Closes the sidebar (mobile) and scrolls to top.
4. Calls a page-specific render function if that page's data can go stale (e.g. `renderPastBills()`, `renderItemsTable()`, `renderStockTable()`, `populateReturnBillSelect()`, `renderSaleSummary()`). This is important: if you add a new page with dynamic content, wire its render call in here too, or it'll show stale data when navigated to.

Pages: `create-bill` (default/active on load), `past-bills`, `items`, `stock`, `sales-return`, `sale-summary`, `your-data`, `settings`. Theme toggle is a sidebar button, not a page.

## Core data model (`AppState` in script.js)

```js
AppState = {
  lineItems: [],        // current in-progress bill's line items
  currentPage,
  paymentMode,
  invoiceCount: {},     // { "2607": 5 } -> yymm -> count, persisted as billhive-meta
  companyData: {...},   // billhive-company
  settings: {...},      // billhive-settings (thank-you messages, T&Cs, currency)
  config: {...},        // billhive-config (future DB fields, inert)
  items: [],            // billhive-items (catalog: {id,name,price,discount,tax,stock,trackStock})
  stockLog: [],         // billhive-stocklog (movement history, capped at 200 entries)
  savedBills: [],        // billhive-bills (every finalized invoice, full snapshot incl. company/settings at save time)
  salesReturns: []       // billhive-returns
}
```

Important: each saved bill (`billhive-bills`) stores a **snapshot** of `companyData` and `settings` at the time it was saved (see `getBillData()`), so reprinting an old bill always shows what was true then, even if the company profile changes later.

## Item catalog <-> line item linking

Line items have an optional `itemId` pointing back into `AppState.items`. This link is created in `updateLineItemName()` when the typed/selected name exactly matches (case-insensitive) a catalog item's name — that's when price/discount/tax auto-fill happens. If there's no match, it's treated as a free-text/one-off item (perfectly valid — the catalog is optional, not enforced).

The item name field uses a native `<input list="items-datalist">` bound to `<datalist id="items-datalist">`, populated by `renderItemsDatalist()` (called whenever items are loaded/saved). This gives native searchable-dropdown behavior without any custom combobox code.

Stock only moves for line items that have an `itemId` **and** whose catalog item has `trackStock !== false`:
- `saveBill()` decrements stock and logs a `'Sale'` movement.
- `processSalesReturn()` increments stock back and logs a `'Sales Return'` movement.
- The Stock page's "Adjust Stock" modal logs `'Manual Add' / 'Manual Remove' / 'Adjustment (set)'`.

## Invoice numbering

Format `yymmnn` (see README). `generateInvoiceNumber()` reads/increments `AppState.invoiceCount[yymm]` and calls `saveInvoiceMeta()` immediately so the counter survives a page reload. **`loadInvoiceMeta()` must run before the first `generateInvoiceNumber()` call** in `init()` — this ordering bug existed in an earlier draft and was fixed; don't reorder those calls without checking.

## Bill lifecycle / UX decision

After a successful `saveBill()` (including via `saveAndPrint()`), the form auto-resets (`resetBillFormForNext()`): customer fields clear, a fresh invoice number is generated, and one empty line item is added — so a cashier can immediately start the next bill. This wasn't explicitly requested but matches normal POS workflow; if that's unwanted, remove the `resetBillFormForNext()` call at the end of `saveBill()`.

`Clear` (the manual button) is a separate, confirmation-gated reset (`clearBill()`) for when a cashier wants to abandon the current in-progress bill.

## Printing

`generatePOSBillHTML(billData, forPrint)` builds the receipt markup (shared by the in-app preview modal and the print window). `printBill(billData)` opens a **new window** with its own fully self-contained `<style>` block (thermal-receipt sizing, monospace font, dashed dividers) — it does NOT depend on `styles.css`, so edits to the main stylesheet won't affect print output. If you change the receipt's visual design, you likely need to edit both `generatePOSBillHTML`'s structure (shared) AND the inline `<style>` in `printBill()` (print-only) AND the `.pos-*` classes in `styles.css` (on-screen preview only).

## Config / "future database" page

Lives inside the **Settings** page (not a separate sidebar item — the sidebar list was specified exactly by the product owner and Config wasn't in it). It has provider/URL/API-key fields plus a disabled sync toggle. `saveConfig()`/`loadConfig()` persist it to `billhive-config`, but nothing in the app actually calls out to a database — it's intentionally inert scaffolding. If you wire up real sync later, this is the natural place to hook in.

## Export / Import

`exportAllData()` bundles every `billhive-*` key (except nothing — it's everything) into one JSON file and triggers a download. `importAllData(event)` reads a chosen JSON file, writes each present key straight back into `localStorage`, then reloads the page (simplest way to get `AppState` and all renders back in sync — don't try to hot-swap `AppState` in place, it's not worth the complexity for a local tool like this).

## Things intentionally NOT done

- No demo/seed data anywhere (explicit requirement).
- No real backend/database — see Config section above.
- No PWA/offline service worker — not requested; app already works offline since it's static files + localStorage, just wasn't packaged as an installable PWA.
- No multi-currency conversion — `settings.currencySymbol` is just a display string, all math is unit-agnostic.

## Known trade-offs / if you touch this next

- All rendering is manual `innerHTML` string templating (no virtual DOM/framework). Keep that pattern for consistency rather than introducing e.g. a templating library for one new page.
- Global functions + a single global `AppState` — fine at this scale, but if the app grows much further (more entities, more relations), consider splitting `script.js` into modules and introducing a proper store, at which point revisit this file structure entirely.
- `formatCurrency`/`formatDate` assume `settings.currencySymbol` and `en-GB`-style dates; adjust if you need locale support.
