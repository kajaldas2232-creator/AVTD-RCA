# Delhivery AVTD RCA Generator

Daily AVTD RCA comment generator. Drop the `avtd_data_YYYY_MM_DD.csv` file and get the RCA comments, Fix Remarks, All-Hubs Summary and WhatsApp summary. Everything runs in your browser. The CSV is never uploaded anywhere.

## Put it live on GitHub Pages
1. GitHub > **New repository** (for example `avtd-rca`) > Create.
2. **Add file > Upload files**. Drag in everything inside this folder (`index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, the `icons` folder, `.nojekyll`, `.gitignore`) > **Commit changes**.
3. **Settings > Pages > Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, Folder = `/ (root)` > Save.
4. After 1-2 minutes your site is at `https://<your-username>.github.io/<repo-name>/`.

## Install it as an app
- Chrome / Edge on PC: click the install icon in the address bar (or menu > Install).
- Android Chrome: menu > **Install app**.
- iPhone Safari: Share > **Add to Home Screen**.

## Update later
Upload the changed files to the repo (same names) and commit. The installed app picks up the new version the next time it opens with internet. If it still shows the old version, close and reopen it once.

## Security notes
- No third-party scripts, fonts or network calls. Strict Content-Security-Policy (`script-src 'self'`).
- CSV text is only shown as plain text, never as HTML.
- Typed reasons and settings are saved in this browser only (localStorage). On a shared PC use **Clear all reasons** in Fix Remarks.
- A public repo means a public site. The site holds no company data, but never upload CSV/XLSX files to the repo (`.gitignore` blocks them).
- Turn on two-factor authentication for your GitHub account.
