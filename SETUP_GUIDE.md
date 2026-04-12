# Contractor Sign-In App — Setup Guide

## How it works

- The app reads and writes a normal `.xlsx` Excel file on your computer
- If the file is inside your OneDrive folder, it syncs automatically — managers can open it in Excel any time
- No Microsoft login, no Azure, no APIs — just a file

---

## Step 1 — Install dependencies

```bash
npm install
```

---

## Step 2 — Set the Excel file path

Open `.env.local` and set `EXCEL_FILE_PATH` to wherever you want the file to live.

It's already set to your OneDrive folder:
```
EXCEL_FILE_PATH=/Users/896166/Library/CloudStorage/OneDrive-hull.ac.uk/Other/Arbaaz/ContractorLog.xlsx
```

Change the path if you want the file somewhere else.

---

## Step 3 — Create the Excel file

Run this once to create the file with the correct column headers:

```bash
node scripts/setup-excel.js
```

You'll see:
```
✅ Created: /Users/.../ContractorLog.xlsx
```

If the file already exists, the script does nothing.

---

## Step 4 — Run the app

```bash
npm run dev
```

- Contractor sign-in/out: [http://localhost:3000](http://localhost:3000)
- Manager dashboard: [http://localhost:3000/dashboard](http://localhost:3000) — PIN is `1234` (change `DASHBOARD_PIN` in `.env.local`)

Test it: sign in a contractor and check that a new row appears in `ContractorLog.xlsx`.

---

## Step 5 — Access on other devices (optional)

To let contractors use their phones on the same Wi-Fi:

1. Find your computer's local IP address:
   ```bash
   ipconfig getifaddr en0
   ```
2. Start the app on your network:
   ```bash
   npm run dev -- -H 0.0.0.0
   ```
3. Contractors go to `http://YOUR-IP:3000` on their phones

---

## Cloudflare R2 photos (optional)

Leave the `CF_*` variables blank in `.env.local` to skip photo uploads entirely — the sign-out form will still work, photos just won't be stored.

To enable photos, see the R2 section in `.env.local.example`.

---

## Customising sign-in questions

Edit the `DYNAMIC_QUESTIONS` array at the top of [components/SignInForm.js](components/SignInForm.js):

```js
const DYNAMIC_QUESTIONS = [
  { name: 'induction', label: 'Have you completed site induction?', type: 'select', options: ['Yes', 'No'] },
  { name: 'ppe',       label: 'Are you wearing required PPE?',       type: 'select', options: ['Yes', 'No'] },
];
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| 500 error on sign-in | Check `EXCEL_FILE_PATH` in `.env.local` — run `node scripts/setup-excel.js` if file doesn't exist yet |
| Sheet not found error | The file exists but has no `ContractorLog` sheet — delete the file and re-run the setup script |
| Changes not syncing to OneDrive | Make sure the file path is inside your OneDrive folder and OneDrive is running |
| Dashboard PIN not working | Check `DASHBOARD_PIN` in `.env.local` — restart `npm run dev` after changing it |
