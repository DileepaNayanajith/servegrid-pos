# BATA KADE customer menu → ServeGrid POS

Source: https://theek23.github.io/batakade-menu/

GitHub source JSON: https://github.com/theek23/batakade-menu/tree/master/menu-json

Reviewed: 2026-10-21. `customer_menu.json` is the canonical machine-readable import.

## What was imported

- Breakfast: Rice & Curry (Vegetable Rs.180, Fish Rs.230, Egg Rs.230, Chicken Rs.280); Bread 1/2 with Gravy Rs.220; Milk Rice one piece Rs.100; Noodles Rs.160; String Hoppers 10/15/20 sets Rs.120/160/200.
- Lunch/Dinner: Rice & Curry (Vegetable Rs.200, Fish Rs.250, Egg Rs.250, Chicken Rs.350); Egg Fried Rice half/full Rs.300/500, Chicken Fried Rice half/full Rs.350/600, Mix Fried Rice half/full Rs.500/700; Biriyani Rs.450; Egg Kottu half/full Rs.400/600; Chicken Kottu half/full Rs.450/650.
- Short Eats: Egg Rolls Rs.100; Fish Rolls Rs.100; Vegetable Roti Rs.80; Parata Roti Rs.60; Egg Roti Rs.80; Wadei Rs.30; Ulundu Wadei Rs.60.
- Beverages: Plain Tea Rs.50; Milk Tea Rs.100; Plain Coffee Rs.60; Milk Coffee Rs.130; combined Nescafe/Nestomalt/Milo entry Rs.120; Soft Drinks Buddy Rs.100, Medium Rs.120.

The combined Nescafe/Nestomalt/Milo entry is split into three buttons with the same Rs.120 price from the source.

## Still needs confirmation

Earlier requirements also named a single String Hopper, Bread 1/4, Bread Full, and Egg (Extra). None has a separately quoted price in the linked menu. These exist as INACTIVE items priced Rs.0 in the **local owner menu** and will not appear on the customer demo screen. Ask the hotel to confirm their prices and availability before enabling them.

## Important pricing/compatibility detail

- `111`, `112`, `113` are set SKUs. **`2*111` means two 10-piece sets**, not 20 pieces billed at a per-piece price.
- Breakfast Rice & Curry uses `101`–`104`; Lunch/Dinner uses `301`–`304` because published prices differ.
- A NEW database on Mac/Windows is seeded with the customer menu. Existing hotel SQLite databases are intentionally NOT overwritten by a new source-code version. Back up existing database and update its items using the Owner menu where required.
- The Vercel preview never receives live hotel orders or money; demo orders remain only in the browser session.
