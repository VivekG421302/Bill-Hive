# Bill-Hive

A fast, offline-first, mobile-first POS billing app that runs entirely in the browser. No backend, no build step, no dependencies beyond two Google Fonts — just open `index.html`.

## Features

- **Create Bill** — customer details, auto-generated invoice numbers (`yymmnn`, resets every month), searchable line items with auto-fill from your item catalog, auto-calculated discount/tax/totals, payment mode selector, and a POS-style thermal-receipt preview & print.
- **Past Bills** — search, preview, reprint or delete any saved invoice.
- **Items** — manage your product/service catalog (price, discount %, tax %, opening stock).
- **Stock** — live stock levels per item, manual add/remove/set adjustments, and a movement log (sales, returns, manual edits).
- **Sales Return** — pick a past invoice, choose which items/quantities to return, auto-calculates the refund and restocks tracked items.
- **Sale Summary** — today / this week / this month / all-time totals, bill count, total refunded, and a top-selling-items breakdown.
- **Your Data** — company name, GST number, address, contact info and logo. The logo prints at the top of every bill and shows in the app header.
- **Settings** — thank-you message pool (randomly picked per bill if notes are left blank), terms & conditions footer, currency symbol, full JSON export/import, a "Danger Zone" full data reset, and a **Database Configuration** panel reserved for a future cloud/DB sync feature (currently local-storage only, clearly labelled "Coming soon").
- **Dark / Light mode**, toggled from the sidebar and remembered across visits.
- **Right-side sidebar navigation** (hamburger menu on the right of the header); the header itself only shows your company logo — no navbar clutter.

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

There is **no seeded/demo data** — the app starts completely empty. Go to **Your Data** first to set up your company profile and logo, then **Items** to build your catalog (optional — you can also just type a custom item name straight into a bill).

## Data & storage

Everything is stored in the browser's `localStorage` under these keys:

| Key | Contents |
|---|---|
| `billhive-company` | Company profile + logo (base64) |
| `billhive-settings` | Thank-you messages, terms & conditions, currency symbol |
| `billhive-config` | Reserved database/sync configuration (inactive) |
| `billhive-items` | Product/service catalog |
| `billhive-stocklog` | Stock movement history |
| `billhive-bills` | All saved invoices |
| `billhive-returns` | All processed sales returns |
| `billhive-meta` | Invoice numbering counters (per year-month) |
| `billhive-theme` | `light` or `dark` |

### Export / Import

Go to **Settings → Data Management**:

- **Export All Data (JSON)** downloads a single timestamped `.json` file containing everything listed above — use it as a backup or to move your data to another browser/device.
- **Import Data** restores from a previously exported file (it will reload the page after importing).

### Erase everything

**Settings → Danger Zone → Erase All Data** wipes every `billhive-*` key from local storage after two confirmations. This cannot be undone — export a backup first if you need one.

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

Vanilla HTML/CSS/JS, no build step, no framework. Fonts: Inter (UI) and JetBrains Mono (numbers). See `CONTEXT.md` for a technical map of the codebase if you're picking this project up in a new AI session or handing it to another developer.
