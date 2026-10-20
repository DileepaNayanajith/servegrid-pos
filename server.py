"""FASTPOS localhost server. Python standard library + SQLite; no pip packages."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
import threading
import time
from datetime import datetime
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
import webbrowser

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA = ROOT / "data"
DB_PATH = Path(os.getenv("FASTPOS_DB_PATH", str(DATA / "fastpos.db")))
HOST, PORT = "127.0.0.1", int(os.getenv("FASTPOS_PORT", "8765"))
SESSIONS: dict[str, float] = {}
SESSION_LOCK = threading.Lock()
WRITE_LOCK = threading.RLock()

# These are EXAMPLE prices for prototyping only; demo mode is enabled by default.
SEED = [
    ("101", "Chicken Rice & Curry", 550, "Rice & Curry", "breakfast,lunch", 1),
    ("102", "Fish Rice & Curry", 480, "Rice & Curry", "breakfast,lunch", 2),
    ("103", "Egg Rice & Curry", 380, "Rice & Curry", "breakfast,lunch", 3),
    ("104", "Veg Rice & Curry", 320, "Rice & Curry", "breakfast,lunch", 4),
    ("110", "String Hoppers", 15, "String Hoppers", "breakfast,dinner", 5),
    ("121", "Paratha", 100, "Other Foods", "breakfast,dinner", 6),
    ("122", "Egg Rotti", 220, "Other Foods", "breakfast,dinner", 7),
    ("123", "Bread - 1/4", 90, "Bread", "breakfast", 8),
    ("124", "Bread - 1/2", 180, "Bread", "breakfast", 9),
    ("125", "Bread - Full", 360, "Bread", "breakfast", 10),
    ("126", "Milk Rice", 180, "Other Foods", "breakfast", 11),
    ("127", "Noodles", 380, "Other Foods", "breakfast,dinner", 12),
    ("201", "Egg (Extra)", 100, "Extras & Drinks", "breakfast,lunch,dinner", 13),
    ("202", "Milk Tea", 150, "Extras & Drinks", "breakfast,lunch,dinner", 14),
    ("203", "Nestamalt", 200, "Extras & Drinks", "breakfast,lunch,dinner", 15),
    ("204", "Plain Tea", 80, "Extras & Drinks", "breakfast,lunch,dinner", 16),
]
RESERVED_CODES = {"111", "112", "113"}  # shortcuts: string hoppers 10, 15, 20
VALID_MEALS = {"breakfast", "lunch", "dinner"}
VALID_PAYMENTS = {"Cash", "Card", "QR"}
VALID_MODES = {"Takeaway", "Dine-in"}


def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout=15000")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db():
    with db() as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.executescript("""
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS items (
            code TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL,
            category TEXT NOT NULL, meals TEXT NOT NULL,
            sort_order INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL, service TEXT NOT NULL, table_no TEXT NOT NULL,
            payment TEXT NOT NULL, cash_received INTEGER NOT NULL, change_due INTEGER NOT NULL,
            total INTEGER NOT NULL, is_demo INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Completed'
        );
        CREATE TABLE IF NOT EXISTS order_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL,
            code TEXT NOT NULL, name TEXT NOT NULL, price INTEGER NOT NULL,
            qty INTEGER NOT NULL, line_total INTEGER NOT NULL,
            FOREIGN KEY(order_id) REFERENCES orders(id)
        );
        """)
        if not con.execute("SELECT 1 FROM items LIMIT 1").fetchone():
            con.executemany("INSERT INTO items(code,name,price,category,meals,sort_order) VALUES(?,?,?,?,?,?)", SEED)
        con.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('demo_mode','1')")


def setting(con, name, fallback=""):
    r = con.execute("SELECT value FROM settings WHERE key=?", (name,)).fetchone()
    return r["value"] if r else fallback


def set_setting(con, key, value):
    con.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))


def item_dict(r):
    return dict(code=r["code"], name=r["name"], price=r["price"], category=r["category"],
                meals=r["meals"].split(","), active=bool(r["active"]), sort=r["sort_order"])


def order_dict(con, r):
    order = dict(r)
    order["is_demo"] = bool(order["is_demo"])
    order["lines"] = [dict(x) for x in con.execute("SELECT code,name,price,qty,line_total FROM order_lines WHERE order_id=? ORDER BY id", (r["id"],))]
    return order


def recent_orders(con, limit=25):
    return [order_dict(con, r) for r in con.execute("SELECT * FROM orders ORDER BY id DESC LIMIT ?", (min(limit, 100),))]


def hash_pin(pin, salt):
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), 250000).hex()


def valid_pin(pin):
    return isinstance(pin, str) and pin.isdigit() and 4 <= len(pin) <= 12


def parse_admin_cookie(cookie_header):
    try:
        cookie = SimpleCookie()
        cookie.load(cookie_header or "")
        return cookie["fastpos_session"].value if "fastpos_session" in cookie else ""
    except Exception:
        return ""


class Handler(BaseHTTPRequestHandler):
    server_version = "FASTPOS/1.0"

    def log_message(self, fmt, *args):
        if os.getenv("FASTPOS_VERBOSE") == "1":
            super().log_message(fmt, *args)

    def _headers(self, code=200, content_type="application/json; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()

    def send_json(self, data, code=200, extra=None):
        out = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self._headers(code, extra=extra)
        self.wfile.write(out)

    def error(self, msg, code=400):
        self.send_json({"error": msg}, code)

    def is_admin(self):
        token = parse_admin_cookie(self.headers.get("Cookie"))
        with SESSION_LOCK:
            expires = SESSIONS.get(token, 0)
            if expires > time.time():
                SESSIONS[token] = time.time() + 4 * 3600
                return True
            if token:
                SESSIONS.pop(token, None)
        return False

    def require_admin(self):
        if not self.is_admin():
            self.error("Owner login required", 403)
            return False
        return True

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/api/state", "/api/orders"):
            with db() as con:
                if path == "/api/orders":
                    self.send_json({"orders": recent_orders(con, 60)})
                else:
                    sales = con.execute("SELECT COUNT(*) AS count,COALESCE(SUM(total),0) AS total FROM orders WHERE is_demo=0 AND status='Completed'").fetchone()
                    self.send_json({
                        "items": [item_dict(r) for r in con.execute("SELECT * FROM items ORDER BY sort_order,code")],
                        "demo_mode": setting(con, "demo_mode", "1") == "1",
                        "admin_configured": bool(setting(con, "pin_hash")),
                        "admin_logged_in": self.is_admin(),
                        "orders": recent_orders(con, 12),
                        "sales": dict(sales),
                    })
            return
        if path == "/":
            path = "/index.html"
        file = (STATIC / path.lstrip("/")).resolve()
        if not file.is_relative_to(STATIC.resolve()) or not file.is_file():
            self.send_error(404)
            return
        content_type = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml"}.get(file.suffix, "application/octet-stream")
        data = file.read_bytes()
        self._headers(200, content_type)
        self.wfile.write(data)

    def do_POST(self):
        path = urlparse(self.path).path
        origin = self.headers.get("Origin")
        if origin and origin not in {f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"}:
            return self.error("Invalid request origin", 403)
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self.error("JSON required", 415)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 200000:
                return self.error("Invalid request size", 413)
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                return self.error("Object expected")
        except (ValueError, json.JSONDecodeError):
            return self.error("Invalid JSON")

        if path == "/api/admin/setup":
            pin = data.get("pin")
            if not valid_pin(pin):
                return self.error("PIN needs 4-12 digits")
            with WRITE_LOCK, db() as con:
                if setting(con, "pin_hash"):
                    return self.error("PIN already created", 409)
                salt = secrets.token_hex(16)
                set_setting(con, "pin_salt", salt)
                set_setting(con, "pin_hash", hash_pin(pin, salt))
            return self._login_success()

        if path == "/api/admin/login":
            pin = data.get("pin", "")
            with db() as con:
                stored = setting(con, "pin_hash")
                salt = setting(con, "pin_salt")
            if not (valid_pin(pin) and stored and hmac.compare_digest(hash_pin(pin, salt), stored)):
                time.sleep(0.2)
                return self.error("Incorrect PIN", 401)
            return self._login_success()

        if path == "/api/admin/logout":
            token = parse_admin_cookie(self.headers.get("Cookie"))
            with SESSION_LOCK:
                SESSIONS.pop(token, None)
            return self.send_json({"ok": True}, extra={"Set-Cookie": "fastpos_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"})

        if path == "/api/admin/menu":
            if not self.require_admin():
                return
            return self._save_menu(data)

        if path == "/api/admin/mode":
            if not self.require_admin():
                return
            go_live = data.get("go_live")
            if not isinstance(go_live, bool):
                return self.error("Invalid mode")
            if go_live and data.get("prices_verified") is not True:
                return self.error("Confirm that all prices were verified")
            with WRITE_LOCK, db() as con:
                if go_live and con.execute("SELECT 1 FROM items WHERE price<=0 AND active=1 LIMIT 1").fetchone():
                    return self.error("Set positive prices for all active items before live mode")
                set_setting(con, "demo_mode", "0" if go_live else "1")
            return self.send_json({"ok": True})

        if path == "/api/orders":
            return self._complete_order(data)

        if path == "/api/admin/void":
            if not self.require_admin():
                return
            try:
                order_id = int(data.get("order_id"))
            except (ValueError, TypeError):
                return self.error("Invalid order")
            with WRITE_LOCK, db() as con:
                result = con.execute("UPDATE orders SET status='Voided' WHERE id=? AND status='Completed'", (order_id,))
                if not result.rowcount:
                    return self.error("Order not found or already voided", 404)
            return self.send_json({"ok": True})

        self.error("Unknown endpoint", 404)

    def _login_success(self):
        token = secrets.token_urlsafe(32)
        with SESSION_LOCK:
            SESSIONS[token] = time.time() + 4 * 3600
        self.send_json({"ok": True}, extra={"Set-Cookie": f"fastpos_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=14400"})

    def _save_menu(self, data):
        items = data.get("items")
        if not isinstance(items, list) or not 1 <= len(items) <= 300:
            return self.error("Provide 1-300 menu items")
        cleaned, codes = [], set()
        for index, raw in enumerate(items):
            if not isinstance(raw, dict):
                return self.error("Invalid menu record")
            code = str(raw.get("code", "")).strip()
            name = str(raw.get("name", "")).strip()
            category = str(raw.get("category", "")).strip()
            meals = raw.get("meals")
            price = raw.get("price")
            if not (len(code) == 3 and code.isdigit() and code not in RESERVED_CODES and code not in codes):
                return self.error(f"Invalid or duplicate code: {code}")
            if not (1 <= len(name) <= 70 and 1 <= len(category) <= 40):
                return self.error(f"Invalid name/category for {code}")
            if not isinstance(price, int) or isinstance(price, bool) or not 0 <= price <= 1000000:
                return self.error(f"Invalid price for {code}")
            if not isinstance(meals, list) or not meals or not set(meals) <= VALID_MEALS:
                return self.error(f"Select meals for {code}")
            cleaned.append((code, name, price, category, ",".join(m for m in ("breakfast", "lunch", "dinner") if m in meals), index, 1 if raw.get("active", True) else 0))
            codes.add(code)
        with WRITE_LOCK, db() as con:
            con.execute("DELETE FROM items")
            con.executemany("INSERT INTO items(code,name,price,category,meals,sort_order,active) VALUES(?,?,?,?,?,?,?)", cleaned)
        self.send_json({"ok": True})

    def _complete_order(self, data):
        key = data.get("key")
        lines = data.get("items")
        service = data.get("service")
        payment = data.get("payment")
        table_no = str(data.get("table_no", "")).strip()
        cash_received = data.get("cash_received", 0)
        if not (isinstance(key, str) and 8 <= len(key) <= 80):
            return self.error("Invalid transaction ID")
        if service not in VALID_MODES or payment not in VALID_PAYMENTS or len(table_no) > 10:
            return self.error("Invalid service or payment")
        if not isinstance(lines, list) or not 1 <= len(lines) <= 100:
            return self.error("Add at least one food item")
        if not isinstance(cash_received, int) or isinstance(cash_received, bool) or cash_received < 0:
            return self.error("Invalid cash amount")
        quantities = {}
        for raw in lines:
            if not isinstance(raw, dict):
                return self.error("Invalid order item")
            code = str(raw.get("code", ""))
            q = raw.get("qty")
            if not (len(code) == 3 and code.isdigit() and isinstance(q, int) and not isinstance(q, bool) and 1 <= q <= 999):
                return self.error("Invalid code or quantity")
            quantities[code] = quantities.get(code, 0) + q
            if quantities[code] > 999:
                return self.error("Too many items on one line")
        with WRITE_LOCK, db() as con:
            existed = con.execute("SELECT * FROM orders WHERE idempotency_key=?", (key,)).fetchone()
            if existed:
                return self.send_json({"order": order_dict(con, existed), "duplicate": True})
            db_items = {r["code"]: r for r in con.execute("SELECT * FROM items WHERE active=1")}
            for code in quantities:
                if code not in db_items:
                    return self.error(f"Food #{code} is no longer available")
            total = sum(db_items[code]["price"] * qty for code, qty in quantities.items())
            if total <= 0:
                return self.error("Please set food prices first")
            if payment == "Cash" and cash_received < total:
                return self.error("Cash received is less than bill total")
            is_demo = 1 if setting(con, "demo_mode", "1") == "1" else 0
            cur = con.execute("INSERT INTO orders(idempotency_key,created_at,service,table_no,payment,cash_received,change_due,total,is_demo) VALUES(?,?,?,?,?,?,?,?,?)", (
                key, datetime.now().astimezone().isoformat(timespec="seconds"), service, table_no,
                payment, cash_received if payment == "Cash" else 0,
                cash_received - total if payment == "Cash" else 0, total, is_demo))
            order_id = cur.lastrowid
            con.executemany("INSERT INTO order_lines(order_id,code,name,price,qty,line_total) VALUES(?,?,?,?,?,?)", [
                (order_id, code, db_items[code]["name"], db_items[code]["price"], qty, db_items[code]["price"] * qty)
                for code, qty in quantities.items()
            ])
            order = order_dict(con, con.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone())
        self.send_json({"order": order, "duplicate": False}, 201)


def run():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("\n" + "=" * 52)
    print("  FASTPOS – Windows Local Touchscreen POS")
    print(f"  Open: http://{HOST}:{PORT}")
    print(f"  Database: {DB_PATH}")
    print("  Close this window / Ctrl+C to stop server")
    print("=" * 52 + "\n", flush=True)
    if os.getenv("FASTPOS_NO_BROWSER") != "1":
        threading.Timer(1.0, lambda: webbrowser.open(f"http://{HOST}:{PORT}")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("FASTPOS stopped")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
