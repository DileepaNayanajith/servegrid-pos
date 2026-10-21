# BATA KADE — Vercel customer UI review

This repository contains TWO separate application modes:

- `server.py` and `static/`: **installed local Python + SQLite POS** for Mac/Windows. This is **not** deployed to Vercel.
- `preview/`: **static, public customer-review UI** with BATA KADE branding; same touchscreen layout and food code workflow, backed by a **browser-only demo simulator**.

**Important:** Prices are imported from the customer-provided BATA KADE menu dated 21 October 2026, but the customer must confirm that the prices are still valid. No real order, payment, card/QR transfer, printer, kitchen workflow or live database exists in the Vercel preview. Test orders are stored only in this browser tab (sessionStorage), not visible to other devices. Anyone with the Vercel preview URL can try the UI. Do not enter private customer data.

## Test preview on Mac before sharing

From the repository root:

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory preview
```

Open http://127.0.0.1:8000/ . Note this previews the **static Vercel demo**. For the actual localhost Python POS, run `python3 server.py` on port 8765 instead.

## Deploy through Vercel dashboard (GitHub)

1. Commit and push the new `preview/` directory and `vercel.json` to the `servegrid-pos` GitHub repository.
2. Go to https://vercel.com/new and import `DileepaNayanajith/servegrid-pos` using the GitHub integration.
3. Project name: `bata-kade-pos-preview` (if available).
4. Keep **Root Directory** as `./` (repository root), **Framework Preset** as `Other`, **Build Command** blank, and **Output Directory** as `preview` (also specified in `vercel.json`).
5. Click **Deploy**. Wait for Vercel to show **Ready** and copy the actual deployment URL from its dashboard. Do not invent a URL before deployment.
6. Share the actual preview link with the customer; ask them to test 101 + Enter, String Hoppers 10/15/20, takeaway/dine-in, bill, and sample checkout.

Changes pushed to the linked GitHub repository will trigger a new Vercel deployment (with Git integration enabled).

## Copy preview into an existing Git repo

If you only downloaded `BATA_KADE_Vercel_Preview_Only.zip`, unzip it into the existing `servegrid-pos` folder (not in a nested subfolder): it contains `preview/` and `vercel.json`.

```bash
git add preview vercel.json VERCEL_PREVIEW_README.md customer_menu.json
git commit -m "Add BATA KADE customer Vercel UI preview"
git push
```

The cloud Vercel preview is NOT the live local POS and should not be used to take customer orders or collect real payments.

## Customer-provided BATA KADE menu (21 Oct 2026)

The UI preview and first-run localhost database now use `customer_menu.json`, transcribed
from https://theek23.github.io/batakade-menu/ (public data source in
`theek23/batakade-menu/menu-json`). Breakfast, Lunch/Dinner, Short Eats, and
Beverages are included. Prices are the published amounts in Sri Lankan rupees,
not fictional examples. **Customer must confirm prices are still current.**

- Breakfast chicken rice `101`: Rs. 280; lunch/dinner chicken rice `301`: Rs. 350.
- String hoppers `111`/`112`/`113`: sets of 10/15/20 at Rs. 120/160/200.
  Entering `2*111` means **two sets of ten**, total Rs. 240.
- Nescafe, Nestomalt and Milo are separated into buttons priced Rs. 120 each,
  corresponding to the combined menu entry.
- Single string hopper, Bread 1/4, Bread Full, and extra Egg have no published
  prices: these start **inactive at Rs. 0** until the owner confirms them.
- The public Vercel deployment remains a *browser-only demo*. No real money
  or customer orders are submitted.
- An existing localhost installation with a previously created `data/fastpos.db`
  is **not automatically overwritten** with menu imports. Back up its database
  and manually revise prices in Owner settings, or start a fresh database for
  a new installation. Never delete the hotel’s actual sales history.
