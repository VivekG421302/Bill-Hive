# Bill-Hive — Feature Batch: 3-Way Work Distribution

**Status: Part 1 is DONE (including a v4.02.1 bug-fix pass). Part 2 and Part 3 have not
been started.** If you are an AI agent picking up Part 2 or Part 3, read your section below
plus `CONTEXT.md`'s **§ Shared conventions for Part 2 / Part 3** section in full before
writing any code — it documents the exact helpers/patterns Part 1 built, several real bugs
that were found and fixed while building them, and gotchas that will bite you if you repeat
them in new code.

> Read `README.md` and `CONTEXT.md` in full before starting. This is a vanilla HTML/CSS/JS
> app, **no build step, no framework, no `<form>` tags**. `index.html` + `script.js` is the
> main SPA.
>
> **Architecture correction (learned during Part 1 — CONTEXT.md was stale about this):**
> `brands.html`, `suppliers.html`, `catalogue.html`, `fulfillment.html` are **not** thin
> pages that link external `styles.css`/`chrome.js`/`{page}.js` files. Each is a
> **self-contained single-file bundle**: the entire contents of `styles.css` are inlined in
> a `<style>` block, the entire contents of `chrome.js` are inlined in the first `<script>`
> block, and that page's own logic is inlined in a second `<script>` block. `chrome.js`,
> `styles.css`, `brands.js`, `suppliers.js`, `catalogue.js` are kept as **maintained source
> modules** — edit them first, then mirror the change into the matching inline block of
> every standalone HTML file. `fulfillment.js` in this repo is a stray duplicate of
> `fulfillment.html`'s full markup, not a real module — ignore it.
>
> **Storage is IndexedDB**, not `localStorage` (an old CONTEXT.md claim). Access it via the
> `dbGet`/`dbSet`/`dbRemove`/`dbClearAll` wrapper already defined in `script.js` (for
> `index.html`) and `chrome.js` (for the standalone pages) — do not read/write
> `localStorage` directly for app data. Adding a new IndexedDB store requires adding it to
> `STORE_NAMES` **and bumping `DB_VERSION`** in both `script.js` and `chrome.js` (and then
> re-syncing `chrome.js` into every standalone page's inline chrome block).
>
> Every part must follow these conventions:
> - No `<form>` tags, ever.
> - Use `$()`/`$$()`/`escapeHtml()` — don't redefine them.
> - Use existing CSS custom properties, don't hardcode colors. **If you override a CSS
>   custom property from JS that a theme class (like `.dark-mode`) also sets, override it on
>   the same element the theme class is applied to (`document.body`), not on
>   `document.documentElement`/`:root` — a class-based rule on an element always beats an
>   inline-style override set on an ancestor.** This exact mistake shipped in Part 1's first
>   pass (accent color silently did nothing in dark mode) and was fixed by moving the
>   override from `document.documentElement` to `document.body`. See `applyAccentColor()` in
>   `script.js`/`chrome.js` for the corrected pattern.
> - **`.app-header` is CSS Grid** (`display:grid; grid-template-columns: 40px 1fr 40px;`),
>   **not flexbox.** `flex-direction` has no effect on it. If you need to reorder header
>   items, use the `order` CSS property (grid items honor it the same as flex items) — see
>   `body.side-left .header-left/.header-center/.header-right { order: ...; }` in
>   `styles.css` for a working example. This exact mistake (`flex-direction: row-reverse` on
>   a grid container, silently doing nothing) shipped in Part 1's first pass.
> - Bump `CACHE_NAME` in `sw.js` if any static asset changes.
> - Update `README.md` and `CONTEXT.md` for any new IndexedDB store, item field, or page.
> - `items` (IndexedDB store) is read by `fulfillment.html`'s page-specific script as
>   `FItems` — check compatibility if the item schema changes.
> - Standalone pages don't import `script.js` — share data only via the `dbGet`/`dbSet`
>   IndexedDB wrapper in `chrome.js`.
> - **`TABLE_COLUMNS` is a `const` declared at global script scope.** Don't declare it a
>   second time in the same page's other `<script>` block — `suppliers.html` and
>   `fulfillment.html` already each have one (for `suppliers-table` and `po-table`) living in
>   their **page-specific** script block, not the shared chrome block, specifically so that
>   re-syncing `chrome.js` into a page can never silently delete it. `catalogue.html` has a
>   structurally different version (`colHidden()`) for `catalogue-table`, also in its
>   page-specific block. Extend the existing map in the right page rather than adding a new
>   one.

---

## PART 1 — Shared Chrome, Theming & Settings Infrastructure ✅ DONE

**Owner: me. Completed, including a v4.02.1 bug-fix pass after user testing feedback.**
Files touched: `index.html`, `script.js`, `chrome.js`, `styles.css`, and every standalone
page's inline `<style>`/first `<script>` block plus header/footer markup, `sw.js`,
`CONTEXT.md`, `README.md`.

**What shipped:**

1. **Menu Position** — Settings → left/right select. `applySidebarSide(side)` sets `order`
   on `.header-left`/`.header-center`/`.header-right` (fixed from an initial
   `flex-direction` attempt that didn't work — see gotcha above) and moves the sidebar panel
   via `body.side-left`.
2. **Header/footer brand icon consistency** — the small "Bill-Hive" hexagon mark in the
   sidebar (`.sidebar-logo`), main header (`.header-brand-icon`), and footer (`.footer-logo`)
   is now the *same inline SVG* in all three places, tinted via `currentColor` +
   `color: var(--accent-primary)`. (First pass wrongly used a static `favicon.svg` `<img>`
   for the header and mirrored the *uploaded company logo* in the footer — both fixed. The
   company logo still only appears in `.header-center`, unrelated to this brand mark.)
3. **Row-click-to-open pattern + top-level view action bars** — `makeRowClickable(el,
   onOpen)` helper (in `script.js` and `chrome.js`) plus `.view-action-bar`/
   `.view-detail-row` CSS, reference-implemented on **Brands** (`#brand-view-modal`,
   `viewBrand()`) and **Suppliers** (`#supplier-view-modal`, `viewSupplier()`), each with
   Edit/Delete/Print buttons.
4. **Table column config** — discovered this already existed pre-Part-1 (undocumented prior
   work) for `suppliers-table`/`po-table`/`catalogue-table`; documented it properly in
   `CONTEXT.md` instead of rebuilding it.
5. **Scroll & drag** — `enableDragScroll()`/`initDragScrollAll()` on `.table-wrap` elements.
6. **Responsive fixes** — action bars wrap under 480px instead of clipping.
7. **Settings button restyle** — border-filled, hover-swaps-fill style scoped to
   `#page-settings .action-btn`/`.import-btn`.
8. **Accent color picker** — `applyAccentColor(hex)`, fixed to override on `document.body`
   (see gotcha above) so it actually works in dark mode.
9. **Screen saver** — `initScreensaver(enabled, seconds)`. Ships as **seconds**, not
   minutes (default 30, range 5–3600) — changed after initial minutes-based version proved
   untestable and had a duplicate-listener bug (fixed with a one-time-bind guard).
10. **Erase Data type-to-confirm** — `#erase-confirm-modal`, must type `delete`.

Full details and exact function/selector names: `CONTEXT.md` § Shared conventions for
Part 2 / Part 3, and § Version history (v4.02.0, v4.02.1).

---

## PART 2 — Items & Catalogue Domain
**Owner: Agent A (separate AI agent/session). Not started. Depends on Part 1 (done) —
read the § Shared conventions section of `CONTEXT.md` and reuse `makeRowClickable()`, the
`.view-action-bar` pattern, and each page's existing column-visibility system instead of
writing new ones.**

Files: `index.html` (Items page section + item modal), `script.js` (item CRUD/render
functions — `openItemModal()`, `saveItemForm()`, `renderItemsTable()`, `deleteItem()` if it
exists, check current state first), `catalogue.html`'s page-specific script block (mirror
into `catalogue.js` too), and `styles.css` additions (mirror into all 4 standalone pages'
inline `<style>` per the sync process above).

1. **Item editing and deletion restriction** — Ensure delete is fully wired and add the rule
   that an item **cannot be deleted while its `stock` is greater than 0** (only relevant when
   `trackStock !== false`). Show a clear inline error/toast explaining why deletion is
   blocked (e.g. "Reduce stock to 0 via Stock Adjustment before deleting"). Untracked items
   (`trackStock === false`) can be deleted freely.
2. **Apply the row-click + action-buttons pattern to the Items page** — clicking a row opens
   an item detail/view with a `.view-action-bar` (Edit/Delete). Follow the exact structure of
   `#brand-view-modal`/`viewBrand()` in `brands.html` or `#supplier-view-modal`/
   `viewSupplier()` in `suppliers.html` — both are complete, working reference
   implementations as of Part 1.
3. **Column config for the Items table** — index.html's Items table already had a
   column-visibility system *before* Part 1 (same `TABLE_COLUMNS`/`loadColumnVisibility`/
   etc. function names, see `script.js`) — just confirm it's still correct and extend if
   needed; don't rebuild it.
4. **Item images** — Extend the item schema with an `images: []` array (up to 4 base64 data
   URLs, same size-limit pattern as `handleBrandLogoUpload` in `brands.html`'s page script,
   i.e. reject >2MB each). Update the item Add/Edit modal in `index.html` to let users
   upload/replace up to 4 images, with per-slot click-to-replace. Update `openItemModal()`,
   `saveItemForm()`, the item schema section of `CONTEXT.md`. Check `fulfillment.html`'s
   page-specific script (which reads items as `FItems`) still works with the new field — it
   should, since it's just an extra array on the object.
5. **Product page interface (Catalogue)** — In `catalogue.html`'s page-specific script block,
   turn each catalogue item into a clickable e-commerce-style product page/detail view
   (modal or dedicated section) showing: name, brand, SKU, price, tax %, all item fields,
   current available stock, and an image gallery of up to 4 images with swipe (touch) and
   click (desktop arrows/dots) navigation. Reuse `makeRowClickable()` to open it. Mirror the
   change into `catalogue.js`.
6. **Responsive column hiding** — Re-check the existing small-screen column hiding on the
   Items table still makes sense once/if you touch the column-config feature; the config
   picker should be the primary mechanism going forward, with sensible small-screen
   defaults.

**Deliverables:** working code, `CONTEXT.md` item schema + Items/Catalogue sections updated,
`README.md` updated (Items feature bullet, Catalogue feature bullet), `sw.js` cache bump,
`CONTEXT.md` Version history row added.

---

## PART 3 — Billing, Sales Return, Suppliers & Fulfillment Domain
**Owner: Agent B (separate AI agent/session). Not started. Depends on Part 1 (done) —
read the § Shared conventions section of `CONTEXT.md` and reuse `makeRowClickable()`, the
`.view-action-bar` pattern, and the existing `suppliers-table`/`po-table` column-visibility
systems instead of writing new ones.**

Files: `index.html` (Past Bills, Sales Return, Sale Summary sections), `script.js`,
`suppliers.html`'s page-specific script block (mirror into `suppliers.js`),
`fulfillment.html`'s page-specific script block (do **not** touch the file named
`fulfillment.js` — it's a stray duplicate, not a real module).

1. **Sales Return "damaged stock" checkbox** — On the Sales Return page, add a "Don't add to
   inventory (log as damaged stock)" checkbox per return. When checked, saving the return
   must create **two** stock-log entries instead of the normal restock: (a) the sales-return
   refund entry as today, and (b) an immediate follow-up stock **adjustment** entry that
   removes the same quantity back out again, tagged as damaged stock (reuse the existing
   "Don't add to inventory" damaged-stock tagging convention already used in Adjust Stock,
   per `CONTEXT.md`'s changelog, for consistency of labels/log entries). Net effect: stock
   count is unchanged, but both movements are visible in the stock log for audit purposes.
2. **Sale Summary layout fix** — Fix the CSS bug where the "Sales by Brand" and "Top Selling
   Items" cards visually merge into each other. Verify at mobile, tablet, and desktop
   widths.
3. **Past Bills date filtering & separation** — Add date-wise section separation (e.g.
   "Today", "Yesterday", grouped by day for older entries) to the Past Bills list, plus a
   date-range filter control (Today / This Week / This Month / This Year / custom range).
   Filter must combine correctly with the existing search.
4. **Apply the row-click + action-buttons pattern to Past Bills** — clicking a row opens the
   bill's view with a `.view-action-bar` containing Edit (if applicable), Delete, Print, and
   **Preview** (bill-specific — reuse the existing preview/print rendering already used for
   Save & Print/Preview on Create Bill). Follow the exact structure of
   `#supplier-view-modal`/`viewSupplier()` in `suppliers.html` as your template.
5. **Apply the row-click + column-config pattern to Fulfillment's Purchase Orders table** —
   row click opens the PO detail with Edit/Delete/Print/Preview actions at the top;
   `po-table`'s column-config already exists (pre-dates Part 1) — confirm/extend it rather
   than rebuilding.
6. **Supplier catalogue management** — Let a supplier record list which catalog items it
   trades (add/remove items on the supplier Add/Edit modal in `suppliers.html`'s
   page-specific script, storing an `itemIds: []`/`items: []` reference on the supplier
   object alongside the existing free-text `itemsSupplied` field — keep the free-text field
   for backward compatibility). Then in `fulfillment.html`'s page-specific script, add a
   supplier filter to the flagged-low-stock-items view so users can filter which flagged
   items to purchase order by supplier, and pre-fill/link items to their known trading
   suppliers when building a PO. Mirror both changes into `suppliers.js` (do not touch the
   file named `fulfillment.js`).

**Deliverables:** working code, `CONTEXT.md` updated (supplier schema, PO schema if
changed, Sales Return section, Past Bills section), `README.md` updated (Sales Return
bullet, Past Bills bullet, Suppliers bullet, Fulfillment bullet), `sw.js` cache bump,
`CONTEXT.md` Version history row added.

---

## Coordination notes for all three agents

- **Merge order:** Part 1 (done) → Part 2 & Part 3 (parallel) → final integration pass to
  bump `sw.js` `CACHE_NAME` once more and re-verify `exportAllData()`/`importAllData()`/
  `resetAllData()` in `script.js` include every new IndexedDB store/field introduced by any
  part (they auto-include anything added to `AppState.settings`, but a brand-new *store*
  needs explicit handling — see `STORE_NAMES`/`DB_VERSION` note above).
- **Don't duplicate:** if you find yourself about to write a new "row click opens detail" or
  "column visibility picker" implementation from scratch in Part 2 or Part 3, stop —
  Part 1 already built `makeRowClickable()`/`.view-action-bar`, and this codebase already has
  working column-visibility systems on 3 tables. Copy their pattern, don't reinvent it, and
  don't redeclare `TABLE_COLUMNS` in a page that already has one.
- **Before editing any file, validate your changes**: run `node --check` on any modified
  `<script>` block (extract it to a temp `.js` file first) and confirm HTML tags are still
  balanced. Part 1 twice caught real regressions this way (a wholesale block-replace that
  nearly deleted `showConfirm()` and the existing column-visibility code) — always diff
  what you're about to overwrite before overwriting a shared block wholesale.
- **Schema changes:** any change to the item, supplier, or purchase-order object shape must
  be reflected in `CONTEXT.md`'s schema sections and cross-checked against every file that
  reads that object (`fulfillment.html`'s page script reads items as `FItems`; `script.js`
  reads suppliers indirectly via PO creation, etc.).
- **Version bump:** after each part, add a new row to the Version History table in
  `CONTEXT.md` describing what shipped, following the v4.02.0/v4.02.1 entries as the format
  to match.
