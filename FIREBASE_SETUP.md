# Firebase Setup Guide (Beginner Friendly)

Follow these steps exactly. You do **not** need a credit card for the free Spark plan for this game.

---

## STEP 1 — Go to Firebase Console

1. Open your browser.
2. Go to: **https://console.firebase.google.com/**
3. Sign in with a Google account.

---

## STEP 2 — Create a Project

1. Click **“Create a project”** (or “Add project”).
2. Project name: e.g. `mafia-game` (any name is fine).
3. Click **Continue**.
4. Google Analytics: you can turn it **Off** (optional).
5. Click **Create project**.
6. Wait a few seconds, then click **Continue**.

---

## STEP 3 — Register a Web App

1. On the Project Overview page, click the **Web** icon (`</>`).
2. App nickname: e.g. `Mafia Web`.
3. **Do not** check “Also set up Firebase Hosting” (we use GitHub Pages).
4. Click **Register app**.
5. You will see a `firebaseConfig` object that looks like:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

6. **Copy these values** — you will paste them into `firebase-config.js` later.
7. Click **Continue to console**.

---

## STEP 4 — Create Realtime Database

1. In the left sidebar, click **Build** → **Realtime Database**.
2. Click **Create Database**.
3. Choose a location (e.g. `United States (us-central1)` or the closest to your players).
4. Click **Next**.
5. Start in **locked mode** (we will set rules next).
6. Click **Enable**.

---

## STEP 5 — Note the Database URL

After creation you will see a URL like:

```
https://YOUR-PROJECT-ID-default-rtdb.firebaseio.com
```

or

```
https://YOUR-PROJECT-ID-default-rtdb.REGION.firebasedatabase.app
```

This is the `databaseURL` value. Add it to your config if it is not already present.

---

## STEP 6 — Enable Authentication

1. In the left sidebar, click **Build** → **Authentication**.
2. Click **Get started**.
3. Open the **Sign-in method** tab.
4. Click **Anonymous**.
5. Toggle **Enable**.
6. Click **Save**.

This is the only sign-in method required. Players are signed in anonymously; no email/password needed.

---

## STEP 7 — Copy Firebase Web Config into the Project

1. Open the file `firebase-config.js` in this project.
2. Replace every placeholder with the values from STEP 3:

```js
const firebaseConfig = {
    apiKey: "AIza...your real key...",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.firebaseio.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456"
};
```

3. Save the file.

**Important:** Never put server-side secrets (service account private keys) in this file. The web config is public by design.

---

## STEP 8 — Publish Database Security Rules

1. In Firebase Console → **Realtime Database** → **Rules** tab.
2. Delete the existing rules.
3. Copy the entire contents of the project file `database.rules.json` and paste them into the Rules editor.
4. Click **Publish**.

These rules:

- Require authentication (`auth != null`) to read/write the room.
- Restrict some private paths to the player’s own `uid`.
- Limit chat message length and require the sender’s uid.

They are not perfect against a determined cheater (client-side logic limitation), but they block unauthenticated access and casual tampering.

---

## STEP 9 — (Optional) Verify Database Structure

You do not need to create any data manually. The game creates:

```
rooms/
  123654/
    players/
    gameMeta/
    actions/
    privateData/
    chat/
```

when the first player joins.

---

## STEP 10 — Cloud Functions?

**Cloud Functions are NOT required** for this project.

Everything runs in the browser + Realtime Database. You only need the steps above.

If you later want stronger server-side validation of phase transitions and role assignment, you can add Cloud Functions, but that is outside the scope of the current ZIP.

---

## STEP 11 — Checklist Before Deploying Frontend

- [ ] Firebase project created
- [ ] Web app registered
- [ ] Realtime Database created
- [ ] Anonymous Authentication enabled
- [ ] `firebase-config.js` filled with real values
- [ ] Database rules published from `database.rules.json`

Once the checklist is complete, go to **GITHUB_SETUP.md** and deploy the frontend.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “Permission denied” | Rules not published, or Anonymous Auth not enabled. |
| “Firebase init failed” | Wrong `apiKey` / `databaseURL` / `projectId` in `firebase-config.js`. |
| Players cannot join | Check browser console for errors. Confirm Auth is Anonymous-enabled. |
| Room stays at 0/8 | Make sure all devices use the **same** Firebase project and the same room code `123654`. |
| Config still shows PASTE_YOUR_... | You forgot to replace the placeholders in `firebase-config.js`. |

---

## Free Tier Limits

Firebase Spark (free) plan is more than enough for a casual 8-player party game. You will not need to upgrade for normal use.
