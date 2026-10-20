# FASTPOS – Local Touchscreen Restaurant POS (Mac + Windows)

A fast, offline-friendly, localhost POS prototype for a busy Sri Lankan hotel counter. No npm, no cloud, no third-party Python packages required. Keyboard food codes and touchscreen food tiles work together.

## Run on your MacBook first

1. Extract this ZIP and open **Terminal** in the `fastpos_windows` folder.
2. Check Python: `python3 --version`. Python **3.10 or newer is recommended**.
3. Start the POS with: `python3 server.py`.
4. Visit **http://127.0.0.1:8765** (the server normally opens the browser automatically). In Chrome use full screen to preview the touch-friendly interface.
5. Keep Terminal open while using the POS; press `Ctrl+C` in Terminal to stop.

You can also use `start_pos.command` on Mac (double-click if macOS allows it; otherwise open it from Terminal: `./start_pos.command`). If macOS blocks a downloaded launcher, simply use `python3 server.py` instead. No `npm install` / `pip install` is needed.

All starting prices are **DEMO examples**, not actual hotel prices. In the Owner panel, create your owner PIN and enter real prices before using the system for live billing. Browser-based printing is a preview; direct thermal printing is not built yet.

## Run on a Windows PC

1. Install **Python 3.10 or newer** from https://www.python.org/downloads/windows/ (tick **Add python.exe to PATH**). If already installed, skip.
2. Extract this entire ZIP folder, e.g. to `Desktop\FASTPOS`.
3. Double-click **`start_pos.bat`**. Keep its black server window open.
4. A browser should open at **http://127.0.0.1:8765**. If not, enter that URL manually.
5. For a cleaner touchscreen view, press **F11** in Chrome/Edge for full screen. Windows display scaling of 100%-125% is a good starting point.
6. Open **Owner** (top right), choose a 4–12 digit owner PIN the first time, and set real hotel food prices under **Prices & Foods**. Keep the PIN private.
7. **Important:** All starting prices are sample prices. **DEMO MODE** is turned on initially. Before taking real payments, verify every price and switch to **LIVE** under Owner Settings. The app will not call any bank/payment terminal or send QR payments.

### Basic cashier workflow

- Select **Breakfast**, **Lunch**, or **Dinner**.
- Tap large food buttons. Tap repeatedly to increase the item quantity.
- For string hoppers, tap `10`, `15`, `20`, or `+1`; alternatively type `111`, `112`, `113`, `110` and press **Enter**.
- Keyboard: `101` Enter = 1 chicken rice. `3*101` Enter = 3 chicken rice. `20*110` Enter = 20 individual string hoppers. Codes are shown on each button.
- Tap **Takeaway** or **Dine-in**. Table number is optional.
- Use **Cash**, **Card**, or **QR**, then confirm external Card/QR payment manually if that method is selected.
- For cash, choose exact cash or enter cash received. Change is calculated automatically.
- Tap **Complete Order**. A receipt preview appears. Use **Print (Browser)** if a printer is configured in Windows.
- When ready, click **New Order**. Undo and cancel controls help recover from mistakes.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `101` + Enter | Chicken Rice x1 |
| `3*101` + Enter | Chicken Rice x3 |
| `111` / `112` / `113` + Enter | String hoppers x10 / x15 / x20 |
| `20*110` + Enter | String hoppers x20 |
| `F2` | Takeaway / dine-in toggle |
| `F4` | Focus food code entry |
| `F8` | Cash / checkout panel |
| `Esc` | Clear unsubmitted code |

All operations also work by touch without knowing codes. Browser shortcuts may differ by browser.

## Prices, data, backups

- Menu is managed from the **Owner** panel (PIN protected). Change price/name/category/meal visibility; add new foods with unique 3-digit codes (except 111–113 which are reserved hopper preset codes).
- All saved orders are stored locally in SQLite in `data/fastpos.db`. Data survives browser closes or PC restarts.
- For backups: **stop the FASTPOS server first**, then copy the **entire `data/` folder** to a USB or other protected location. Do not delete `data/` unless you intend to reset the POS.
- The browser/UI connects to the local server on **127.0.0.1** only. No internet connection required. Because database resides on the POS PC, if that PC fails without backups the orders may be lost.
- Demo orders are flagged and excluded from live sales totals. To start again with a new installation, use a *new* folder rather than deleting existing financial records.

## Printing and production caveats

- **Browser receipt print** is supported as a preview. **Automatic direct thermal/ESC-POS printing is not implemented** yet. Actual automatic printer integration requires the printer model, port/driver and receipt paper width.
- Cash/Card/QR are **recorded tender types, not payment processing**. Card/QR must be confirmed on the terminal/app separately.
- Live mode records local transactions but **this is a single-PC starter application, not a certified fiscal/payment platform**. Before relying on it for a real hotel, test receipts, tax/invoice rules, cash reconciliation, outages, refund policy, user access, and backup process.
- No prices are provided by the hotel; starting amounts are deliberately **illustrative demo prices** and must be replaced/verified before live use.

## Support commands

Open Command Prompt in this folder and run:

```cmd
py -3 server.py
```

If `py` is not recognized, try `python server.py`.

Visit http://127.0.0.1:8765 . To stop, press `Ctrl+C` in the server window.

To use a different local port:

```cmd
set FASTPOS_PORT=8766
py -3 server.py
```


## GitHub workflow (develop on Mac, install on Windows)

This project includes a `.gitignore` so the **local transaction database and owner settings are not pushed** to GitHub. Each machine starts with its own local `data/fastpos.db` file. **Git pull/clone does not transfer orders, payment records or owner PIN.** Back up those records separately and securely.

This distribution includes the source files plus a local Git repository in the Git-ready ZIP. To publish it, create an **empty** GitHub repository named `fastpos-touchscreen-pos` under your GitHub account. Do **not** add a README or .gitignore on GitHub because they already exist locally. Then on your Mac:

```bash
cd ~/Downloads/fastpos_windows
# Set your own Git identity for future commits:
git config user.name "YOUR NAME"
git config user.email "YOUR GITHUB EMAIL"
# Only after creating the empty repo on GitHub:
git remote add origin https://github.com/YOUR_USERNAME/fastpos-touchscreen-pos.git
git push -u origin main
```

On the Windows hotel PC, install Git and Python, then in Command Prompt:

```cmd
git clone https://github.com/YOUR_USERNAME/fastpos-touchscreen-pos.git
cd fastpos-touchscreen-pos
start_pos.bat
```

If your unzip tool extracts a folder with another name, adjust the `cd` path accordingly. Later code updates: commit and `git push` on Mac; on Windows stop FASTPOS first, then `git pull`, then start it again. Always **back up `data/` before upgrading** the installed POS. Never put financial/customer data or credentials in the Git repo.

If downloaded as the *source-only* ZIP (without a `.git` folder), run `git init -b main`, `git add .`, `git commit -m "Initial FASTPOS localhost touch POS"` before adding your remote.
