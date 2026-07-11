# Bill-Hive

A fast, offline-first, mobile-first POS billing app that runs entirely in the browser. No backend, no build step, no dependencies beyond two Google Fonts — just open `index.html`. Installable as a PWA on desktop and mobile.

## Features

- **Create Bill** — customer details, auto-generated invoice numbers (`yymmnn`, resets every month), searchable line items with auto-fill from your item catalog, auto-calculated discount/tax/totals, payment mode selector, and a POS-style thermal-receipt preview & print.
- **Past Bills** — search, preview, reprint or delete any saved invoice.
- **Items** — manage your product/service catalog with SKU code, EAN/barcode, item number, brand, cost price, selling price, discount %, tax %, and opening stock.
- **Stock** — live stock levels per item, manual add/remove/set adjustments, and a movement log (sales, returns, manual edits, purchase receipts).
- **Sales Return** — pick a past invoice, choose which items/quantities to return, auto-calculates the refund and restocks tracked items.
- **Sale Summary** — Today's Sales, **Net Sales Today**, This Week, This Month, **Net Sales Monthly**, All-Time totals, bill count, total refunded, **Sales by Brand** percentage breakdown, and a top-selling-items chart.
- **Your Brands** — a lightweight catalog of the brands you sell under (name, description, 4:1 logo), on its own page (`brands.html`).
- **Suppliers** — manage the vendors you purchase stock from (contact person, phone, email, address, items supplied, notes), on its own page (`suppliers.html`).
- **Fulfillment** — a purchasing workspace (`fulfillment.html`) that flags catalog items at or below 5 units in stock, lets you build a Purchase Order against a supplier for the flagged items, and tracks each PO through Pending → Ordered → Received. Marking a PO as Received adds the ordered quantities back into stock and logs a "Purchase Received" stock movement.
- **Catalogue** — a read-only, browsable view (`catalogue.html`) of your full item catalog grouped by brand, with search and a brand filter. **Print Catalogue** generates a clean, full-page black & white document (company logo, name, and address up top) you can hand to customers or keep as a price list.
- **Excel Import for Items** — on the Items page, **Download Template** gives you a ready-to-fill `.xlsx` with the exact columns Bill-Hive expects (Name, SKU, EAN, Item Number, Brand, Cost, Price, Discount %, Tax %, Opening Stock, Track Stock). **Import Excel** reads a filled-in copy back in; any brand name in the sheet that doesn't already exist in Your Brands is created automatically.
- **Print Setup** — in Settings, choose the font weight (Normal/Bold/Extra Bold) and paper width (58mm/80mm) used for every printed and previewed bill, with **Preview Dummy Bill** / **Print Dummy Bill** buttons to test your settings before saving. The company logo always prints/previews in black & white.
- **Your Data** — company name, GST number, address, contact info and a 4:1 logo, shown centered in the app header and at the top of every printed bill. The page is view-only by default; tap the pencil icon to edit.
- **Settings** — thank-you message pool (randomly picked per bill if notes are left blank), terms & conditions footer, currency symbol, **Menu Position** (move the sidebar/hamburger menu to the left or right of the screen), **Accent Color** picker (re-tints buttons, links and the app's logo marks, and travels with Export/Import), **Screen Saver** (idle overlay after a configurable number of seconds — any click or key press exits it), full JSON export/import, a "Danger Zone" full data reset that now requires typing **delete** to confirm, and a **Database Configuration** panel reserved for a future cloud/DB sync feature (currently local-only, clearly labelled "Coming soon"). Every button on the Settings page uses a border-filled style whose fill and text colors swap on hover.
- **PWA** — installable as a standalone app on desktop (Chrome/Edge) and Android. Offline-capable via service worker. Install button appears in the sidebar automatically when the browser supports it.
- **Dark / Light mode**, toggled from the sidebar and remembered across visits.
- **Configurable sidebar navigation** (hamburger menu + sidebar panel; left or right of the header, your choice in Settings); the header itself shows only your centered company logo (4:1 banner) — no navbar clutter. The small Bill-Hive brand icon in the header and footer always matches the one in the sidebar, independent of your uploaded company logo.
- **Row-click-to-view** — on the Your Brands and Suppliers pages, clicking anywhere on a card/row opens a read-only detail view with its own top-level Edit / Delete / Print buttons (more pages will adopt this pattern going forward).

## Getting started

No installation required.

1. Unzip the folder.
2. Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
3. Optional: serve it over a local static server if your browser restricts `file://` access to `localStorage`/file uploads, e.g.:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8080
   ```

> **PWA install** requires serving over HTTPS or `localhost`. The "Install App" button in the sidebar will appear automatically when your browser detects the app is installable.

There is **no seeded/demo data** — the app starts completely empty. Go to **Your Data** first to set up your company profile and logo, then **Items** to build your catalog (optional — you can also just type a custom item name straight into a bill).

## Data & storage

Everything is stored in the browser's IndexedDB (database `billhive-db`) under these object stores. (Older installs that still have data in `localStorage` are migrated across automatically the first time the app loads — you won't notice anything.)

| Store | Contents |
|---|---|
| `company` | Company profile + logo (base64, 4:1 recommended) |
| `settings` | Thank-you messages, terms & conditions, currency symbol, print setup, menu position, accent color, screen saver |
| `config` | Reserved database/sync configuration (inactive) |
| `items` | Product/service catalog (name, SKU, EAN, item number, brand, cost, price, discount, tax, stock) |
| `stocklog` | Stock movement history |
| `bills` | All saved invoices |
| `returns` | All processed sales returns |
| `brands` | Brands you sell under (name, description, logo) |
| `suppliers` | Suppliers/vendors you purchase stock from |
| `purchaseOrders` | Purchase orders created from the Fulfillment page |
| `meta` | Invoice numbering counters (per year-month) |
| `theme` | `light` or `dark` |
| `columnVisibility` | Which optional columns you've hidden on each table with a column picker |

Note: `brands`, `suppliers`, `purchaseOrders` and `columnVisibility` are managed on their own pages (`brands.html`, `suppliers.html`, `fulfillment.html`, `catalogue.html`) rather than inside `index.html`, but they are still included in the Settings → Export/Import bundle and the Danger Zone reset on the main app.

### Export / Import

Go to **Settings → Data Management**:

- **Export All Data (JSON)** downloads a single timestamped `.json` file containing everything listed above — use it as a backup or to move your data to another browser/device.
- **Import Data** restores from a previously exported file (it will reload the page after importing).

### Erase everything

**Settings → Danger Zone → Erase All Data** opens a confirmation dialog where you must type **delete** before "Erase Everything" becomes clickable. This cannot be undone — export a backup first if you need one.

## Invoice numbering rule

Invoice numbers are 6 digits: `yymmnn`

- `yy` — two-digit year (e.g. `26` for 2026)
- `mm` — two-digit month
- `nn` — invoice count for that month, starting at `01` and resetting to `01` on the first bill of the next month

The field is read-only in the UI; the app generates it automatically when a new bill is started.

## Printing

Printing opens a dedicated print window sized for **58/80mm thermal POS receipts** (max-width 300px, monospace font, dashed section dividers). Print order:

1. Company logo
2. Company name + GST number
3. Address + contact details
4. Invoice number + date/time
5. Line items (name, qty, rate, discount %, tax %, amount)
6. Totals (bill amount → discount → tax → net amount)
7. "You have saved ₹X" (only if a discount applies)
8. Payment mode
9. Random thank-you message
10. Terms & conditions

Use **Preview** to see this exact layout on screen before printing, or **Save & Print** to save the bill and print it in one step.

## Roadmap / not yet implemented

- Actual cloud database sync (Firebase / Supabase / custom REST API) — the **Settings → Database Configuration** panel exists and saves your intended provider/URL/key, but nothing syncs yet. This is intentionally scaffolded for a future update.
- Multi-user accounts / auth.
- Barcode scanning.

## Tech

Vanilla HTML/CSS/JS, no build step, no framework. Fonts: Inter (UI) and JetBrains Mono (numbers).

See [`CONTEXT.md`](CONTEXT.md) for a full technical map of the codebase — file roles, AppState shape, localStorage schema, item object schema, PWA details, CSS conventions, and a feature-addition checklist. Read it before making any code changes.

https://claude.ai/share/340d1f0d-7851-43c1-9831-3d7df945f436