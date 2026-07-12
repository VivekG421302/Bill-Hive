# CLAUDE.md — Instructions for the Part 3 Agent

You are picking up **Part 3 — Billing, Sales Return, Suppliers & Fulfillment Domain** on
Bill-Hive. Part 1 (shared chrome/theming/settings) and Part 2 (Items & Catalogue) are both
**done**. Read the docs below in full before writing any code.

## Read these first, in order

1. **`README.md`** — end-user feature list. Skim it for context.
2. **`CONTEXT.md`** — the real technical map. Read in full, especially:
   - **§ Shared conventions for Part 2 / Part 3** — `makeRowClickable()`, the
     `.view-action-bar` pattern, the column-visibility picker, sidebar-side, accent color,
     screensaver, and the header-icon conventions. **Reuse these — don't rewrite them.**
   - **§ Version history**, specifically the `v4.02.0`/`v4.02.1` (Part 1) and `v4.03.0`
     (Part 2) rows, so you know exactly what already shipped and what patterns to copy.
   - **§ Item object schema** — Part 2 added `images: []` to items. Your PO/supplier work
     reads items (`FItems` in `fulfillment.html`) — this is just an extra array field, no
     compatibility work needed, but don't strip it if you touch item-rendering code.
3. **`prompt__2_.md`** (the original 3-way work-distribution doc) — your task list is the
   **PART 3** section. Full text reproduced below for convenience, but the file itself may
   have more surrounding context worth a skim.

## Your task list (Part 3)

Files you'll touch: `index.html` (Past Bills, Sales Return, Sale Summary sections),
`script.js`, `suppliers.html`'s page-specific `<script>` block (mirror into `suppliers.js`),
`fulfillment.html`'s page-specific `<script>` block. **Do NOT touch the file named
`fulfillment.js`** — it's a stray duplicate of `fulfillment.html`'s markup, not a real
module (see § File map in `CONTEXT.md`).

1. **Sales Return "damaged stock" checkbox** — add a "Don't add to inventory (log as
   damaged stock)" checkbox per return. When checked, saving the return must create **two**
   stock-log entries instead of a normal restock: (a) the sales-return refund entry as
   today, and (b) an immediate adjustment entry that removes the same qty back out again,
   tagged as damaged stock — reuse the existing "Don't add to inventory" damaged-stock
   convention already used in Adjust Stock (see `CONTEXT.md`'s v2.3 changelog entry) so the
   labels/log entries stay consistent. Net stock effect: zero, but both movements are
   visible in the log.
2. **Sale Summary layout fix** — fix the CSS bug where "Sales by Brand" and "Top Selling
   Items" cards visually merge. Verify at mobile, tablet, and desktop widths.
3. **Past Bills date filtering & separation** — add date-wise section separation ("Today",
   "Yesterday", grouped by day for older entries) plus a date-range filter (Today / This
   Week / This Month / This Year / custom range). Must combine correctly with the existing
   search.
4. **Row-click + action bar on Past Bills** — clicking a row opens the bill's view with
   Edit (if applicable) / Delete / Print / **Preview** (bill-specific — reuse the existing
   preview/print rendering from Save & Print/Preview on Create Bill). Template:
   `#supplier-view-modal`/`viewSupplier()` in `suppliers.html`.
5. **Row-click + column-config on Fulfillment's PO table** — row click opens the PO detail
   with Edit/Delete/Print/Preview at the top. `po-table`'s column-config already exists
   (pre-dates Part 1) — confirm/extend it, don't rebuild it.
6. **Supplier catalogue management** — let a supplier record list which catalog items it
   trades. Add/remove items on the supplier Add/Edit modal, storing `itemIds: []`/`items: []`
   on the supplier object **alongside** the existing free-text `itemsSupplied` field (keep
   that field for backward compatibility). In `fulfillment.html`'s page script, add a
   supplier filter to the flagged-low-stock view so items can be filtered by supplier, and
   pre-fill/link items to their known trading suppliers when building a PO. Mirror changes
   into `suppliers.js` (not `fulfillment.js`).

## Deliverables

- Working code for all 6 items above.
- `CONTEXT.md` updated: supplier schema, PO schema (if changed), a Sales Return section, a
  Past Bills section.
- `README.md` updated: Sales Return bullet, Past Bills bullet, Suppliers bullet, Fulfillment
  bullet.
- `sw.js` — bump `CACHE_NAME` again (current value after Part 2 is `billhive-v4.03.0`; use
  something like `billhive-v4.04.0` for your pass, or whatever the next logical version is).
- A new row in `CONTEXT.md`'s § Version history table, in the same format as the
  `v4.02.0`/`v4.02.1`/`v4.03.0` rows.

## Conventions you must follow (same as every part)

- No `<form>` tags, ever.
- Use `$()`/`$$()`/`escapeHtml()` — don't redefine them.
- Use existing CSS custom properties — don't hardcode colors. If you override a CSS custom
  property from JS that a theme class (`.dark-mode`) also sets, override it on
  `document.body`, not `document.documentElement`/`:root` (see `applyAccentColor()` for the
  correct pattern and why — a class-based rule on an element always beats an inline-style
  override on an ancestor).
- `.app-header` is CSS Grid (`grid-template-columns: 40px 1fr 40px`), not flexbox. Use
  `order`, not `flex-direction`, if you ever touch header layout.
- Bump `CACHE_NAME` in `sw.js` if any static asset changes.
- Standalone pages (`suppliers.html`, `fulfillment.html`) don't import `script.js` — share
  data only via the `dbGet`/`dbSet` IndexedDB wrapper in `chrome.js`.
- `TABLE_COLUMNS` is a `const` at global script scope in each page that has one
  (`suppliers-table` in `suppliers.html`, `po-table` in `fulfillment.html`, living in each
  page's **page-specific** script block, not the shared chrome block). Don't redeclare it.
- Adding a new IndexedDB store or field: add to `STORE_NAMES`, bump `DB_VERSION` in both
  `script.js` and `chrome.js`, and re-sync `chrome.js` into every standalone page's inline
  chrome block if the store list changed. A new *field* on an existing store (e.g. adding
  `itemIds` to a supplier object) needs no `STORE_NAMES`/`DB_VERSION` change — just update
  the schema docs and the read/write code.
- Standalone pages are **self-contained single-file bundles**: `styles.css` is inlined in a
  `<style>` block, `chrome.js` is inlined in the first `<script>` block, and the page's own
  logic is inlined in a second `<script>` block. Edit `chrome.js`/`styles.css`/`suppliers.js`
  first (source modules), then mirror the change into the matching inline block of the
  relevant standalone HTML file(s). Before wholesale-replacing an inline block, grep it for
  page-specific additions (like `TABLE_COLUMNS`) that aren't in the source module, so a sync
  can't silently delete them.
- Before editing any file, validate your changes: run `node --check` on any modified
  `<script>` block (extract it to a temp `.js` file first) and confirm HTML tags are still
  balanced (e.g. `<div\b` vs `</div>` counts should match).
- Any change to the item, supplier, or purchase-order object shape must be reflected in
  `CONTEXT.md`'s schema sections and cross-checked against every file that reads that object.

## What NOT to touch

- `fulfillment.js` — stray duplicate, not a real module.
- Anything in the Part 2 domain (Items page CRUD/images, Catalogue product page) unless a
  Part 3 task explicitly requires reading from it (e.g. `FItems` in `fulfillment.html`).
- Don't re-implement `makeRowClickable()`, the view-modal pattern, or column-visibility —
  they already exist. Copy the pattern from Brands/Suppliers/Items, don't rebuild it.
