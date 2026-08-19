# Design — Artist Commissions & Payouts

Status: **DRAFT for review** · 2026-08-06 · owner: operator + Claude

Turns the site into an operations tool: a monthly (and all-time) **commission
report** that computes what the shop owes each artist (20% of item price) across
**both** the online store and in-person shows, feeding a **payout portal** where
the operator records payments and sees, per artist, **earned / paid / balance** —
where balance can be negative (the shop advanced the artist).

---

## 1. Confirmed decisions (from Q&A)

1. **Artist earns 20%** of the **item price only** (before tax, shipping, and
   card-processing fees).
2. Sales come from **two Square locations**: **Online Sales** (the storefront)
   and **Mobile** (in-person shows — the same location we *exclude* from the
   storefront order model).
3. **Show sales apply an order-level discount** to the whole purchase. Commission
   is therefore taken on each line's **net amount after its allocated share of
   the order discount**, not the sticker price. (Square distributes order-level
   discounts into each line item's `total_discount_money`.)
4. Per artist, per month, the earnings are broken out **by item type**:
   **Acrylic** vs **Prints** — and **each cell is manually editable** (override).
5. The report/portal reads **production Square directly** (via the prod token),
   independent of the app's `SQUARE_ENV=sandbox` mode.

## 2. Resolved decisions (confirmed)

- **Refunds** — a refund **reduces** the artist's earnings for that item
  proportionally (commission follows actual net revenue). ✓
- **History depth** — from the **start of Square sales** (both locations). No
  pre-Square/WooCommerce import. ✓
- **Timezone** — calendar month by the order's **paid/closed date** in
  **America/Chicago**. ✓
- **House / non-payable** — house accounts (e.g. **Animeniacs Studios**) are
  **NON-PAYABLE but still COMPUTED and shown** — the report calculates their 20%
  so it's visible, but they're flagged `payable = false` and excluded from
  amounts-owed/payout obligations. A per-artist `payable` flag drives this. ✓
- **Unattributed sales** — line items with **no artist category** (or a category
  with no `artists` row) are bucketed as **Unattributed**, shown for review, and
  never paid. ✓

## 3. Data sources & architecture

- **Production Square read client** — a new server-only, admin-only
  `getProductionSquareClient()` using `SQUARE_PROD_ACCESS_TOKEN` + Production
  environment. Used **only** by the commissions module. Read-only; never touches
  checkout/storefront (those stay sandbox). This is a scoped, deliberate
  exception to the "prod token = scripts only" note, isolated to admin reporting.
  - Requires `SQUARE_PROD_ACCESS_TOKEN` as a **runtime env var on the deployed
    app** (add to `env.ts` as optional; set in Coolify). The module degrades to
    an empty report if absent (no crash).
- **Order source** — `Orders.search` over **both** location ids
  (`SQUARE_ONLINE_LOCATION_ID`, `SQUARE_MOBILE_LOCATION_ID`), paginated, by
  `closed_at` date range, `state = COMPLETED`. Line-item money + discounts come
  from the **raw Square order** (not our denormalized `orders.lineItems`, which
  omit the discount breakdown and fold in tax).
- **Attribution per line item:**
  1. `catalog_object_id` (the variation) → parent **item** → its **artist
     category** (child of the "Artist" parent) → `artists` row.
  2. **Item type** from the chosen **variation name**: `Acrylic Wall Art` →
     `acrylic`, `Vinyl Decal Prints` → `prints` (reuse `classify.ts` constants).
     Anything else → `other`.
  3. **Commission base** = `gross_sales_money − total_discount_money` (net item
     price, pre-tax). **Earning = 20% of base.** Refunds subtract pro-rata (⚠️).
- **Catalog lookups** batched/cached (item→category and variation→item maps),
  reused across the whole sweep.

## 4. Data model (Drizzle / Postgres)

```
commission_earnings            -- MATERIALIZED from Square (one row per artist/month/type/location)
  id, artist_id (fk), year_month (text 'YYYY-MM'), item_type ('acrylic'|'prints'|'other'),
  location ('online'|'mobile'),
  gross_cents, discount_cents, refund_cents, net_cents,
  commission_cents,            -- 20% of net (the computed owed amount)
  order_count, computed_at
  UNIQUE(artist_id, year_month, item_type, location)

commission_overrides           -- manual monthly edits ("change what they made")
  id, artist_id (fk), year_month, item_type,
  override_commission_cents,   -- replaces the computed cell when present
  note, created_by, created_at, updated_at
  UNIQUE(artist_id, year_month, item_type)

artist_payouts                 -- money actually paid out (or advanced)
  id, artist_id (fk), amount_cents (>0), paid_at (date), method (text), note,
  created_by, created_at
```

**Effective earning** for a cell = `override_commission_cents ?? commission_cents`.
**Artist balance (owed)** = `Σ effective earnings − Σ payouts`.
- Positive → shop **owes** the artist.
- Negative → artist has been **advanced** (owes the shop) — supported naturally.

`commission_earnings` is a cache refreshed by a **sync** (button + optional
cron); overrides and payouts are the durable operator inputs and are **never**
overwritten by a sync.

## 5. Portal UI — `(admin)/admin/commissions`

Admin-gated (same `getCurrentUser()` + `ADMIN_EMAILS` pattern; money actions
re-check admin).

1. **Monthly report** (the thing you run monthly): pick a month → table of every
   artist × {Acrylic, Prints, total} owed, with online/show split, grand total.
   **Export CSV / print**. Each cell **editable** (writes an override).
2. **Artist ledger** (per artist): all-time monthly earnings (by type),
   **payout history**, and the running **balance** (Owed / Advanced badge).
   - **Record payout** form: amount, date, method, note → `artist_payouts`.
3. **All-artists summary**: earned / paid / balance per artist, sortable; totals.
4. **Sync** control: "Refresh from Square (all history / this month)" → repopulates
   `commission_earnings`. Shows last-synced time + any unattributed sales to fix.

Themed in the Street Gallery dark theme; `(admin)` stays `force-dynamic`.

## 6. Phasing

- **P1 — Report engine + monthly view (read-only):** prod Square client, both
  locations, attribution + 20% net calc, `commission_earnings` table + sync, the
  monthly report table with online/show split and CSV export. *Delivers the
  monthly "who is owed what" report end-to-end.*
- **P2 — Payout portal:** `artist_payouts` + `commission_overrides`, per-artist
  ledger with earned/paid/balance (bidirectional), payout entry, editable cells.
- **P3 — Polish:** all-artists summary, unattributed-sales resolver, optional
  cron sync, statement export per artist.

## 7. Constraints / risks

- **Sandbox vs prod:** reads prod while the app is sandbox — isolated read-only
  client; needs the prod token in the app env. Does **not** affect the
  storefront/checkout sandbox gate.
- **Deploy:** the Coolify deploy target is currently misconfigured (see the
  domain/deploy findings) — this feature can't go live until that's resolved and
  `SQUARE_PROD_ACCESS_TOKEN` is set on the serving app.
- **Performance:** "all history × both locations" is a large sweep — hence
  materialized `commission_earnings` + incremental month sync rather than
  recomputing on every page load.
- **Correctness:** commission math keys off **raw** Square line money
  (discount-aware, pre-tax); refunds and timezone per the open questions above.
- **Gate suite** unchanged (typecheck, tests, unreachable-DB build); new DB
  tables ship via a Drizzle migration.
```
