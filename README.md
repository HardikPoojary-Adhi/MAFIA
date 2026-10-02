# MAFIA — Multiplayer Browser Party Game

A complete 8-player Mafia (Werewolf-style) party game that runs entirely in the browser.

**Hosting:** GitHub Pages (static frontend)  
**Backend:** Firebase Realtime Database (realtime multiplayer)  
**Room code:** `123654` (fixed single room)

All 8 players open the same GitHub Pages URL on any device (PC, phone, tablet), enter the room code, pick a name, and play together in realtime.

---

## Features

- Exactly **8 players** required
- Fixed room **123654**
- Random role assignment
- Private roles (other players cannot see your role)
- Realtime updates across all devices (no page refresh needed)
- Realtime table chat
- Mobile-friendly dark cinematic UI
- Persistent player identity via localStorage + Firebase Anonymous Auth
- Disconnect handling (game continues with existing state)
- Clear win conditions including Jester

---

## Roles (exactly 8)

| Role       | Count | Team     | Ability |
|------------|-------|----------|---------|
| Mafia      | 2     | Mafia    | Each night both select a kill target. Same target → that player dies. Different → random of the two. Know each other. |
| Detective  | 1     | Innocent | Investigate one player or Nobody. If Mafia → learn "MAFIA" (they live). If non-Mafia → that player is ejected (subject to Doctor). |
| Doctor     | 1     | Innocent | Protect one living player (can be self) from Mafia kill and Detective ejection this round. |
| Spy        | 1     | Innocent | **One-time** reveal of exact role of one living player. After use: "SPY POWER USED" and phase is skipped. |
| Innocent   | 2     | Innocent | No special ability. Survive and eliminate Mafia. |
| Jester     | 1     | Neutral  | Knows who the Mafia are. Wins **only** if voted out while at least one Mafia is still alive. Does not win if killed at night. |

---

## Round Order (always)

1. **Mafia** — both living Mafia select a target  
2. **Detective** — investigate or skip  
3. **Doctor** — protect one player  
4. **Spy** — one-time role reveal (or skip if already used)  
5. **Voting** — every living player votes; majority eliminates (tie = nobody)  

Then the next round begins (night resolve happens before voting).

---

## Win Conditions

- **Innocents win:** All Mafia are eliminated.
- **Mafia win:** Number of living Mafia ≥ number of living non-Mafia.
- **Jester wins:** Jester is eliminated by **vote** while at least one Mafia remains alive.

When the game ends, a full GAME OVER screen shows the winner and every player’s final role.

---

## Technology

- HTML + CSS + Vanilla JavaScript (no build step, no React/Vite)
- Firebase App / Auth / Realtime Database (CDN)
- GitHub Pages for static hosting
- Firebase Anonymous Authentication for player identity

---

## Quick Start (after you configure Firebase)

1. Create a Firebase project and Realtime Database (see **FIREBASE_SETUP.md**).
2. Enable **Anonymous** authentication.
3. Paste your Firebase web config into `firebase-config.js`.
4. Publish the Database rules from `database.rules.json`.
5. Create a GitHub repository named `mafia-game` and upload all files (see **GITHUB_SETUP.md**).
6. Enable GitHub Pages (Deploy from branch → `main` → `/` root).
7. Open `https://YOUR_USERNAME.github.io/mafia-game/`
8. On 8 devices, enter names and join room **123654**.
9. When the lobby shows 8/8, click **START GAME**.

---

## Local Development

1. Fill in `firebase-config.js` with a real Firebase project.
2. Serve the folder with any static server, e.g.:
   ```bash
   npx serve .
   # or
   python -m http.server 8080
   ```
3. Open `http://localhost:8080` (or the port shown).
4. Open multiple browser windows / incognito profiles to simulate players.

**Note:** The game does **not** work from `file://` because of module/CORS and Firebase security. Always use a local HTTP server or GitHub Pages.

---

## Disconnect Behavior

- **Lobby:** Players marked `connected: false` can be cleaned when someone tries to join a full room.
- **During game:** The player’s state (role, alive/dead, actions already submitted) is kept. The game continues. Other players see them as “Away”. Refreshing the page reconnects the same player via Firebase Auth + localStorage.

---

## Security Notes

- Player identity uses Firebase Anonymous Auth (`auth.uid`).
- Roles and private investigation results live under `privateData/{uid}` and are readable primarily by that uid (plus dead/ended reveals).
- Actions (votes, mafia targets, etc.) are written by the acting player.
- Game state transitions (phase changes, role assignment, win checks) are performed by clients using the current database state.
- **Limitation of pure client-side architecture:** A determined user who reverse-engineers the Firebase writes can attempt to alter phase, roles, or votes. For a casual party game this is usually acceptable. For stronger guarantees you would add Firebase Cloud Functions that validate and apply state transitions server-side.
- The included `database.rules.json` restricts unauthenticated access and limits some writes to the authenticated uid. Deploy these rules in the Firebase Console.

---

## File Structure

```
mafia-game/
├── index.html          # Main page
├── style.css           # Dark cinematic theme + responsive layout
├── game.js             # Complete game logic + Firebase integration
├── firebase-config.js  # Your Firebase credentials (placeholders)
├── database.rules.json # Realtime Database security rules
├── README.md
├── FIREBASE_SETUP.md   # Step-by-step Firebase guide
└── GITHUB_SETUP.md     # Step-by-step GitHub Pages guide
```

No Cloud Functions are required for this version. No `npm install` or build step is needed for the frontend.

---

## License

Free to use and modify for personal / educational / party use.
