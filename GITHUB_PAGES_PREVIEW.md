# BATA KADE customer preview

GitHub Pages publishes only `preview/` from `client/bata-kade` using `.github/workflows/pages.yml`. Main remains unchanged. Repository Settings → Pages → Source must be **GitHub Actions**.

Expected URL: https://DileepaNayanajith.github.io/servegrid-pos/

All assets use relative paths so the project URL works. The menu is embedded in `preview/demo-api.js` from `customer_menu.json`. No backend, credentials, or payment provider is deployed. Sample orders use browser-tab session storage. Card/QR and cash checkout are simulations.

To review: type `101` + Enter, then `2*111` + Enter; total should be Rs. 520. F2 toggles Dine-in/Takeaway, F4 focuses the code, F8 focuses cash. EXACT then TRY DEMO CHECKOUT produces a demo receipt. Lunch/Dinner include rice, fried rice and kottu.

Push changes to `client/bata-kade` to deploy. The workflow can also be run manually on that branch. Check its successful deployment and the live UI before sharing.
