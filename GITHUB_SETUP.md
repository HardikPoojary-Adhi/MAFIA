# GitHub Pages Setup Guide

GitHub Pages hosts the **frontend only**. Firebase provides the multiplayer backend. You never run a Node server.

---

## 1. Create a GitHub Account (if needed)

Go to https://github.com and sign up.

---

## 2. Create a New Repository

1. Click the **+** icon (top right) → **New repository**.
2. Repository name: **`mafia-game`** (exactly this name is recommended so the URL is clean).
3. Visibility: **Public** (required for free GitHub Pages).
4. Do **not** initialize with README, .gitignore, or license (we already have the files).
5. Click **Create repository**.

---

## 3. Upload the Project Files

### Option A — Drag & Drop (easiest)

1. On the empty repository page, click **uploading an existing file**.
2. Drag **all** files from the extracted ZIP into the browser window:
   - `index.html`
   - `style.css`
   - `game.js`
   - `firebase-config.js` (already filled with your Firebase values)
   - `database.rules.json`
   - `README.md`
   - `FIREBASE_SETUP.md`
   - `GITHUB_SETUP.md`
3. Commit message: e.g. `Initial mafia game`
4. Click **Commit changes**.

### Option B — Git command line

```bash
cd mafia-game          # the folder that contains index.html
git init
git add .
git commit -m "Initial mafia game"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mafia-game.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## 4. Enable GitHub Pages

1. Open your repository on GitHub.
2. Click **Settings**.
3. In the left sidebar, click **Pages**.
4. Under **Source**, select **Deploy from a branch**.
5. Branch: **main**.
6. Folder: **/ (root)**.
7. Click **Save**.

---

## 5. Wait for Deployment

- GitHub will build the site (usually 30–90 seconds).
- Refresh the Pages settings page until you see a green banner:
  **Your site is live at https://YOUR_USERNAME.github.io/mafia-game/**

---

## 6. Open the Game

1. Open the URL shown:
   ```
   https://YOUR_USERNAME.github.io/mafia-game/
   ```
2. On **8 different devices** (or browser profiles / incognito windows):
   - Open the same URL.
   - Enter a unique name.
   - Join room **123654**.
3. When the lobby shows **8 / 8**, any player can click **START GAME**.

---

## Important Notes

- GitHub Pages only serves the static files (`index.html`, CSS, JS).
- All multiplayer state lives in **your** Firebase Realtime Database.
- If you change `firebase-config.js` later, commit and push again; Pages will update automatically.
- Custom domain is optional and not required.

---

## Updating the Game Later

1. Edit files locally.
2. Commit and push to `main`.
3. Wait ~1 minute for Pages to redeploy.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| 404 on the Pages URL | Wait longer, or confirm branch is `main` and folder is `/ (root)`. |
| Blank page / Firebase errors | Check browser console. Confirm `firebase-config.js` has real values (not PASTE_YOUR_...). |
| Different devices see different rooms | All must use the exact same GitHub Pages URL and the same Firebase project. |
| “Room is full” with fewer than 8 | Previous disconnected players may still be listed. Have someone refresh or wait for the game to end and reset. |
