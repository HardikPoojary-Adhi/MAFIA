/**
 * MAFIA — Complete Multiplayer Browser Game
 * Room: 123654 | Exactly 8 players
 * Backend: Firebase Realtime Database
 * Frontend: Vanilla JS (GitHub Pages compatible)
 */

(function () {
    'use strict';

    // ============================================================
    // CONSTANTS
    // ============================================================
    const ROOM_CODE = '123654';
    const MAX_PLAYERS = 8;
    const ROLES = ['MAFIA', 'MAFIA', 'DETECTIVE', 'DOCTOR', 'SPY', 'INNOCENT', 'INNOCENT', 'JESTER'];
    const PHASES = ['mafia', 'detective', 'doctor', 'spy', 'voting'];
    const PHASE_LABELS = {
        mafia: 'MAFIA',
        detective: 'DETECTIVE',
        doctor: 'DOCTOR',
        spy: 'SPY',
        voting: 'VOTING',
        resolve: 'RESOLVING',
        ended: 'ENDED'
    };
    const TEAM = {
        MAFIA: 'Mafia',
        DETECTIVE: 'Innocent',
        DOCTOR: 'Innocent',
        SPY: 'Innocent',
        INNOCENT: 'Innocent',
        JESTER: 'Neutral'
    };
    const LOCAL_ID_KEY = 'mafiaPlayerId';
    const LOCAL_NAME_KEY = 'mafiaPlayerName';

    // ============================================================
    // STATE
    // ============================================================
    let app = null;
    let auth = null;
    let db = null;
    let roomRef = null;
    let myUid = null;
    let myName = null;
    let players = {};
    let gameMeta = {};
    let actions = {};
    let privateData = {};
    let chatUnsub = null;
    let playersUnsub = null;
    let metaUnsub = null;
    let actionsUnsub = null;
    let privateUnsub = null;
    let isHostStarting = false;
    let lastPhase = null;
    let connectionRef = null;

    // ============================================================
    // UTILITIES
    // ============================================================
    function $(id) { return document.getElementById(id); }
    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const el = $(id);
        if (el) el.classList.add('active');
    }
    function toast(msg, duration = 3000) {
        const t = $('toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('show'), duration);
    }
    function showModal(text) {
        return new Promise(resolve => {
            $('modal-text').textContent = text;
            $('modal').classList.remove('hidden');
            const ok = $('modal-ok');
            const handler = () => {
                $('modal').classList.add('hidden');
                ok.removeEventListener('click', handler);
                resolve();
            };
            ok.addEventListener('click', handler);
        });
    }
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    function getLivingPlayers() {
        return Object.values(players).filter(p => p.alive !== false);
    }
    function getLivingIds() {
        return Object.keys(players).filter(id => players[id].alive !== false);
    }
    function isAlive(uid) {
        return players[uid] && players[uid].alive !== false;
    }
    function roleClass(role) {
        if (!role) return '';
        return role.toLowerCase();
    }
    function countByRole(role, livingOnly = true) {
        return Object.values(players).filter(p =>
            p.role === role && (!livingOnly || p.alive !== false)
        ).length;
    }
    function mafiaAlive() {
        return countByRole('MAFIA', true);
    }
    function nonMafiaAlive() {
        return getLivingPlayers().filter(p => p.role !== 'MAFIA').length;
    }
    function generateId() {
        return 'p_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    }

    // ============================================================
    // FIREBASE INIT
    // ============================================================
    function initFirebase() {
        if (!firebaseConfig || firebaseConfig.apiKey.includes('PASTE_YOUR')) {
            showScreen('screen-join');
            $('join-error').textContent = 'Please configure firebase-config.js with your Firebase credentials first. See FIREBASE_SETUP.md';
            $('btn-join').disabled = true;
            return false;
        }
        try {
            app = firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            db = firebase.database();
            roomRef = db.ref('rooms/' + ROOM_CODE);
            return true;
        } catch (e) {
            console.error(e);
            showScreen('screen-join');
            $('join-error').textContent = 'Firebase init failed: ' + e.message;
            return false;
        }
    }

    // ============================================================
    // AUTH & PLAYER ID
    // ============================================================
    async function ensureAuth() {
        return new Promise((resolve, reject) => {
            const unsub = auth.onAuthStateChanged(async (user) => {
                unsub();
                if (user) {
                    myUid = user.uid;
                    resolve(user);
                } else {
                    try {
                        const cred = await auth.signInAnonymously();
                        myUid = cred.user.uid;
                        resolve(cred.user);
                    } catch (e) {
                        reject(e);
                    }
                }
            });
        });
    }

    function getStoredPlayerId() {
        try {
            return localStorage.getItem(LOCAL_ID_KEY);
        } catch (e) {
            return null;
        }
    }
    function storePlayerId(id) {
        try {
            localStorage.setItem(LOCAL_ID_KEY, id);
        } catch (e) {}
    }
    function getStoredName() {
        try {
            return localStorage.getItem(LOCAL_NAME_KEY) || '';
        } catch (e) {
            return '';
        }
    }
    function storeName(name) {
        try {
            localStorage.setItem(LOCAL_NAME_KEY, name);
        } catch (e) {}
    }

    // ============================================================
    // CONNECTION / PRESENCE
    // ============================================================
    function setupPresence() {
        if (!myUid) return;
        const connectedRef = db.ref('.info/connected');
        connectedRef.on('value', (snap) => {
            if (snap.val() === true) {
                const myRef = roomRef.child('players/' + myUid);
                myRef.onDisconnect().update({ connected: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
                myRef.update({ connected: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
            }
        });
    }

    // ============================================================
    // JOIN / LOBBY
    // ============================================================
    async function joinRoom(name) {
        name = name.trim().slice(0, 16);
        if (!name) {
            $('join-error').textContent = 'Please enter a name.';
            return;
        }
        $('btn-join').disabled = true;
        $('join-error').textContent = '';

        try {
            await ensureAuth();
            storePlayerId(myUid);
            storeName(name);
            myName = name;

            // Check current state
            const snap = await roomRef.once('value');
            const data = snap.val() || {};
            const existingPlayers = data.players || {};
            const status = (data.gameMeta && data.gameMeta.status) || 'lobby';

            // Rejoin if already in room
            if (existingPlayers[myUid]) {
                await roomRef.child('players/' + myUid).update({
                    name: name,
                    connected: true,
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
                myName = name;
                setupPresence();
                subscribeAll();
                if (status === 'playing' || status === 'ended') {
                    // will be handled by listeners
                } else {
                    showScreen('screen-lobby');
                }
                return;
            }

            // Room full?
            const playerIds = Object.keys(existingPlayers);
            if (playerIds.length >= MAX_PLAYERS) {
                // Clean disconnected lobby players
                if (status === 'lobby') {
                    const toRemove = [];
                    for (const id of playerIds) {
                        const p = existingPlayers[id];
                        if (p.connected === false) toRemove.push(id);
                    }
                    if (playerIds.length - toRemove.length >= MAX_PLAYERS) {
                        throw new Error('Room is full (8/8).');
                    }
                    for (const id of toRemove) {
                        await roomRef.child('players/' + id).remove();
                    }
                } else {
                    throw new Error('Room is full or game already in progress.');
                }
            }

            if (status === 'playing') {
                throw new Error('Game already started. Wait for it to finish.');
            }
            if (status === 'ended') {
                // Allow new lobby after game over if cleared, else reset possible by host later
            }

            // Join
            await roomRef.child('players/' + myUid).set({
                uid: myUid,
                name: name,
                alive: true,
                connected: true,
                joinedAt: firebase.database.ServerValue.TIMESTAMP,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });

            // Ensure gameMeta exists
            const metaSnap = await roomRef.child('gameMeta').once('value');
            if (!metaSnap.exists()) {
                await roomRef.child('gameMeta').set({
                    status: 'lobby',
                    phase: null,
                    round: 0,
                    winner: null,
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                });
            } else if (metaSnap.val().status === 'ended') {
                // Reset for new game if previous ended
                // Only reset if fewer than 8 or user wants; keep simple: allow join
            }

            setupPresence();
            subscribeAll();
            showScreen('screen-lobby');
        } catch (e) {
            console.error(e);
            $('join-error').textContent = e.message || 'Failed to join.';
            $('btn-join').disabled = false;
        }
    }

    function renderLobby() {
        const list = $('lobby-players');
        const ids = Object.keys(players);
        const count = ids.length;
        $('lobby-count').textContent = count + ' / ' + MAX_PLAYERS;

        list.innerHTML = '';
        ids.forEach(id => {
            const p = players[id];
            const li = document.createElement('li');
            const initial = (p.name || '?')[0].toUpperCase();
            li.innerHTML = `
                <div class="avatar">${escapeHtml(initial)}</div>
                <span class="name">${escapeHtml(p.name || 'Unknown')}</span>
                ${id === myUid ? '<span class="you-badge">YOU</span>' : ''}
                ${p.connected === false ? '<span class="text-muted">(away)</span>' : ''}
            `;
            list.appendChild(li);
        });

        const canStart = count === MAX_PLAYERS && gameMeta.status === 'lobby';
        $('btn-start').disabled = !canStart;
        if (count < MAX_PLAYERS) {
            $('lobby-status').textContent = `Waiting for ${MAX_PLAYERS - count} more player(s)...`;
        } else if (gameMeta.status === 'lobby') {
            $('lobby-status').textContent = 'All players ready! Anyone can start the game.';
        } else {
            $('lobby-status').textContent = 'Game starting...';
        }
    }

    // ============================================================
    // START GAME
    // ============================================================
    async function startGame() {
        if (isHostStarting) return;
        isHostStarting = true;
        $('btn-start').disabled = true;

        try {
            const snap = await roomRef.once('value');
            const data = snap.val() || {};
            const currentPlayers = data.players || {};
            const ids = Object.keys(currentPlayers);

            if (ids.length !== MAX_PLAYERS) {
                toast('Need exactly 8 players.');
                isHostStarting = false;
                return;
            }
            if (data.gameMeta && data.gameMeta.status !== 'lobby') {
                toast('Game already started or ended.');
                isHostStarting = false;
                return;
            }

            // Assign roles randomly
            const shuffled = shuffle(ROLES);
            const roleMap = {};
            ids.forEach((id, i) => {
                roleMap[id] = shuffled[i];
            });

            // Find mafia and jester for private info
            const mafiaIds = ids.filter(id => roleMap[id] === 'MAFIA');
            const jesterId = ids.find(id => roleMap[id] === 'JESTER');

            // Write roles ONLY into privateData (public players node never holds live roles)
            // Roles are revealed onto players/{id}/role only when the player dies or game ends
            const updates = {};
            ids.forEach(id => {
                updates[`players/${id}/alive`] = true;
                updates[`players/${id}/role`] = null; // ensure no role leaks
                updates[`privateData/${id}/role`] = roleMap[id];
                updates[`privateData/${id}/spyUsed`] = false;
                updates[`privateData/${id}/detectiveResult`] = null;
                updates[`privateData/${id}/spyResult`] = null;
            });

            // Mafia know each other
            mafiaIds.forEach(mid => {
                updates[`privateData/${mid}/teammates`] = mafiaIds.filter(x => x !== mid);
            });

            // Jester knows mafia
            if (jesterId) {
                updates[`privateData/${jesterId}/knownMafia`] = mafiaIds;
            }

            updates['gameMeta/status'] = 'playing';
            updates['gameMeta/phase'] = 'mafia';
            updates['gameMeta/round'] = 1;
            updates['gameMeta/winner'] = null;
            updates['gameMeta/mafiaAlive'] = 2;
            updates['gameMeta/startedAt'] = firebase.database.ServerValue.TIMESTAMP;
            updates['actions'] = {
                mafia: {},
                votes: {},
                resolved: false
            };
            // detective, doctor, spy, detectiveEject are written only when the role acts
            // (null/NOBODY for skip is still a deliberate write)
            updates['publicLog'] = null; // optional

            await roomRef.update(updates);
            toast('Game started!');
        } catch (e) {
            console.error(e);
            toast('Failed to start: ' + e.message);
            $('btn-start').disabled = false;
        } finally {
            isHostStarting = false;
        }
    }

    // ============================================================
    // PHASE ACTIONS
    // ============================================================
    async function submitMafiaTarget(targetId) {
        if (!isAlive(myUid) || (privateData.role || (players[myUid] && players[myUid].role)) !== 'MAFIA') return;
        if (targetId === myUid) {
            toast('Cannot kill yourself.');
            return;
        }
        if (!isAlive(targetId)) {
            toast('Target is already dead.');
            return;
        }
        try {
            await roomRef.child('actions/mafia/' + myUid).set(targetId);
            toast('Target selected. Waiting for other Mafia...');
            maybeResolveNight();
        } catch (e) {
            toast('Error: ' + e.message);
        }
    }

    async function submitDetectiveTarget(targetId) {
        if (!isAlive(myUid) || (privateData.role || (players[myUid] && players[myUid].role)) !== 'DETECTIVE') return;
        try {
            await roomRef.child('actions/detective').set(targetId); // null for nobody
            if (targetId === null || targetId === 'NOBODY') {
                await roomRef.child('privateData/' + myUid + '/detectiveResult').set({ target: null, result: 'SKIPPED' });
            } else {
                // Read target role from privateData (visible to auth users; UI never displays others' live roles)
                const privSnap = await roomRef.child('privateData/' + targetId + '/role').once('value');
                const targetRole = privSnap.val();
                const isMafia = targetRole === 'MAFIA';
                const result = isMafia ? 'MAFIA' : 'NOT MAFIA';
                await roomRef.child('privateData/' + myUid + '/detectiveResult').set({
                    target: targetId,
                    targetName: players[targetId] ? players[targetId].name : '?',
                    result: result
                });
                if (!isMafia) {
                    await roomRef.child('actions/detectiveEject').set(targetId);
                } else {
                    await roomRef.child('actions/detectiveEject').set(null);
                }
            }
            toast(targetId ? 'Investigation complete.' : 'You chose to skip.');
            advancePhaseIfReady();
        } catch (e) {
            toast('Error: ' + e.message);
        }
    }

    async function submitDoctorProtect(targetId) {
        if (!isAlive(myUid) || (privateData.role || (players[myUid] && players[myUid].role)) !== 'DOCTOR') return;
        if (!isAlive(targetId)) {
            toast('Cannot protect a dead player.');
            return;
        }
        try {
            await roomRef.child('actions/doctor').set(targetId);
            toast('Protection set.');
            advancePhaseIfReady();
        } catch (e) {
            toast('Error: ' + e.message);
        }
    }

    async function submitSpyTarget(targetId) {
        if (!isAlive(myUid) || (privateData.role || (players[myUid] && players[myUid].role)) !== 'SPY') return;
        if (privateData.spyUsed) {
            toast('Spy power already used.');
            return;
        }
        if (!isAlive(targetId)) {
            toast('Target is dead.');
            return;
        }
        try {
            const privSnap = await roomRef.child('privateData/' + targetId + '/role').once('value');
            const role = privSnap.val() || '?';
            await roomRef.child('privateData/' + myUid + '/spyResult').set({
                target: targetId,
                targetName: players[targetId] ? players[targetId].name : '?',
                role: role
            });
            await roomRef.child('privateData/' + myUid + '/spyUsed').set(true);
            await roomRef.child('actions/spy').set(targetId);
            toast('You learned their role.');
            advancePhaseIfReady();
        } catch (e) {
            toast('Error: ' + e.message);
        }
    }

    async function submitVote(targetId) {
        if (!isAlive(myUid)) return;
        if (targetId === myUid) {
            toast('Cannot vote for yourself.');
            return;
        }
        if (!isAlive(targetId)) {
            toast('Cannot vote for a dead player.');
            return;
        }
        try {
            await roomRef.child('actions/votes/' + myUid).set(targetId);
            toast('Vote cast.');
            maybeResolveVoting();
        } catch (e) {
            toast('Error: ' + e.message);
        }
    }

    // ============================================================
    // PHASE ADVANCEMENT & RESOLUTION
    // ============================================================
    function getLivingMafiaIds() {
        return getLivingIds().filter(id => players[id].role === 'MAFIA');
    }

    async function maybeResolveNight() {
        // Called after mafia actions; full night resolve happens at end of phases
        // We advance phases one by one
    }

    async function advancePhaseIfReady() {
        // This is called by clients after their action. We use a simple approach:
        // The first client that sees all required actions for current phase advances it.
        // Use transaction-like check via reading current state.
        try {
            const snap = await roomRef.once('value');
            const data = snap.val() || {};
            const meta = data.gameMeta || {};
            const acts = data.actions || {};
            const pls = data.players || {};

            if (meta.status !== 'playing') return;

            const phase = meta.phase;
            const living = Object.keys(pls).filter(id => pls[id].alive !== false);

            const privAll = data.privateData || {};
            const roleOf = (id) => (privAll[id] && privAll[id].role) || (pls[id] && pls[id].role) || null;

            if (phase === 'mafia') {
                const mafiaLiving = living.filter(id => roleOf(id) === 'MAFIA');
                const mafiaActs = acts.mafia || {};
                const allMafiaActed = mafiaLiving.every(id => mafiaActs[id] != null);
                if (mafiaLiving.length === 0 || allMafiaActed) {
                    await roomRef.child('gameMeta/phase').set('detective');
                }
            } else if (phase === 'detective') {
                const det = living.find(id => roleOf(id) === 'DETECTIVE');
                if (!det || acts.hasOwnProperty('detective')) {
                    await roomRef.child('gameMeta/phase').set('doctor');
                }
            } else if (phase === 'doctor') {
                const doc = living.find(id => roleOf(id) === 'DOCTOR');
                if (!doc || acts.hasOwnProperty('doctor')) {
                    await roomRef.child('gameMeta/phase').set('spy');
                }
            } else if (phase === 'spy') {
                const spy = living.find(id => roleOf(id) === 'SPY');
                const spyPriv = (spy && privAll[spy]) || {};
                if (!spy || spyPriv.spyUsed === true || acts.hasOwnProperty('spy')) {
                    await resolveNightAndGoToVoting(data);
                }
            }
        } catch (e) {
            console.error('advancePhaseIfReady', e);
        }
    }

    async function resolveNightAndGoToVoting(data) {
        // Resolve mafia kill + detective eject with doctor protection
        const meta = data.gameMeta || {};
        const acts = data.actions || {};
        const pls = data.players || {};
        const living = Object.keys(pls).filter(id => pls[id].alive !== false);

        // Determine mafia target
        const privAll = data.privateData || {};
        const roleOf = (id) => (privAll[id] && privAll[id].role) || (pls[id] && pls[id].role) || null;
        const mafiaLiving = living.filter(id => roleOf(id) === 'MAFIA');
        const mafiaActs = acts.mafia || {};
        let mafiaTarget = null;
        if (mafiaLiving.length > 0) {
            const targets = mafiaLiving.map(id => mafiaActs[id]).filter(Boolean);
            if (targets.length > 0) {
                const unique = [...new Set(targets)];
                if (unique.length === 1) {
                    mafiaTarget = unique[0];
                } else {
                    mafiaTarget = unique[Math.floor(Math.random() * unique.length)];
                }
            }
        }

        // Detective eject (only non-mafia)
        let detectiveEject = acts.detectiveEject || null;

        // Doctor protection
        const protectedId = acts.doctor || null;

        // Apply kills
        const updates = {};
        let killedByMafia = null;
        let ejectedByDet = null;

        let mafiaAlive = (meta.mafiaAlive != null) ? meta.mafiaAlive : 2;
        if (mafiaTarget && mafiaTarget !== protectedId && pls[mafiaTarget] && pls[mafiaTarget].alive !== false) {
            updates[`players/${mafiaTarget}/alive`] = false;
            const priv = (data.privateData && data.privateData[mafiaTarget]) || {};
            if (priv.role) {
                updates[`players/${mafiaTarget}/role`] = priv.role;
                if (priv.role === 'MAFIA') mafiaAlive = Math.max(0, mafiaAlive - 1);
            }
            killedByMafia = mafiaTarget;
        }
        if (detectiveEject && detectiveEject !== protectedId && detectiveEject !== killedByMafia &&
            pls[detectiveEject] && pls[detectiveEject].alive !== false) {
            updates[`players/${detectiveEject}/alive`] = false;
            const priv = (data.privateData && data.privateData[detectiveEject]) || {};
            if (priv.role) {
                updates[`players/${detectiveEject}/role`] = priv.role;
                if (priv.role === 'MAFIA') mafiaAlive = Math.max(0, mafiaAlive - 1);
            }
            ejectedByDet = detectiveEject;
        }
        updates['gameMeta/mafiaAlive'] = mafiaAlive;

        // Clear actions for voting, set phase
        updates['actions/mafia'] = {};
        updates['actions/detective'] = null;       // remove intentional write markers
        updates['actions/detectiveEject'] = null;
        updates['actions/doctor'] = null;
        updates['actions/spy'] = null;
        updates['actions/votes'] = {};
        updates['actions/resolved'] = true;
        updates['gameMeta/phase'] = 'voting';
        updates['gameMeta/lastNight'] = {
            mafiaTarget: killedByMafia,
            detectiveEject: ejectedByDet,
            protected: protectedId
        };

        await roomRef.update(updates);

        // Check win after night deaths
        setTimeout(() => checkWinConditions(), 500);
    }

    async function maybeResolveVoting() {
        try {
            const snap = await roomRef.once('value');
            const data = snap.val() || {};
            const meta = data.gameMeta || {};
            if (meta.status !== 'playing' || meta.phase !== 'voting') return;

            const pls = data.players || {};
            const acts = data.actions || {};
            const living = Object.keys(pls).filter(id => pls[id].alive !== false);
            const votes = acts.votes || {};

            const allVoted = living.every(id => votes[id] != null);
            if (!allVoted) return;

            // Tally
            const tally = {};
            living.forEach(id => {
                const v = votes[id];
                if (v) tally[v] = (tally[v] || 0) + 1;
            });

            let maxVotes = 0;
            let eliminated = null;
            let tie = false;
            for (const [tid, count] of Object.entries(tally)) {
                if (count > maxVotes) {
                    maxVotes = count;
                    eliminated = tid;
                    tie = false;
                } else if (count === maxVotes) {
                    tie = true;
                }
            }

            const updates = {};
            let mafiaAlive = (meta.mafiaAlive != null) ? meta.mafiaAlive : 2;
            if (!tie && eliminated && maxVotes > 0) {
                updates[`players/${eliminated}/alive`] = false;
                const priv = (data.privateData && data.privateData[eliminated]) || {};
                const role = priv.role || (pls[eliminated] && pls[eliminated].role) || null;
                if (role) {
                    updates[`players/${eliminated}/role`] = role;
                    if (role === 'MAFIA') mafiaAlive = Math.max(0, mafiaAlive - 1);
                }
                updates['gameMeta/lastVote'] = {
                    eliminated: eliminated,
                    votes: maxVotes,
                    tie: false
                };
                updates['gameMeta/mafiaAlive'] = mafiaAlive;

                // Check Jester win
                if (role === 'JESTER' && mafiaAlive > 0) {
                    updates['gameMeta/status'] = 'ended';
                    updates['gameMeta/winner'] = 'JESTER';
                    updates['gameMeta/phase'] = 'ended';
                    // Reveal all remaining roles
                    Object.keys(pls).forEach(id => {
                        const pr = (data.privateData && data.privateData[id] && data.privateData[id].role);
                        if (pr) updates[`players/${id}/role`] = pr;
                    });
                    await roomRef.update(updates);
                    return;
                }
            } else {
                updates['gameMeta/lastVote'] = { eliminated: null, votes: 0, tie: true };
            }

            // Next round — null deletes keys so next phase waits for fresh actions
            updates['actions/votes'] = {};
            updates['actions/mafia'] = {};
            updates['actions/detective'] = null;
            updates['actions/detectiveEject'] = null;
            updates['actions/doctor'] = null;
            updates['actions/spy'] = null;
            updates['gameMeta/round'] = (meta.round || 1) + 1;
            updates['gameMeta/phase'] = 'mafia';

            await roomRef.update(updates);

            setTimeout(() => checkWinConditions(), 400);
        } catch (e) {
            console.error('maybeResolveVoting', e);
        }
    }

    async function checkWinConditions() {
        try {
            const snap = await roomRef.once('value');
            const data = snap.val() || {};
            const meta = data.gameMeta || {};
            if (meta.status !== 'playing') return;

            const pls = data.players || {};
            const livingCount = Object.values(pls).filter(p => p.alive !== false).length;
            const mafiaCount = (meta.mafiaAlive != null) ? meta.mafiaAlive : 0;
            const nonMafiaCount = livingCount - mafiaCount;

            let winner = null;
            if (mafiaCount <= 0) {
                winner = 'INNOCENTS';
            } else if (mafiaCount >= nonMafiaCount) {
                winner = 'MAFIA';
            }

            if (winner) {
                const updates = {
                    'gameMeta/status': 'ended',
                    'gameMeta/winner': winner,
                    'gameMeta/phase': 'ended'
                };
                // Reveal all roles
                const priv = data.privateData || {};
                Object.keys(pls).forEach(id => {
                    if (priv[id] && priv[id].role) {
                        updates[`players/${id}/role`] = priv[id].role;
                    }
                });
                await roomRef.update(updates);
            }
        } catch (e) {
            console.error('checkWinConditions', e);
        }
    }

    // ============================================================
    // RENDER GAME UI
    // ============================================================
    function renderGame() {
        if (gameMeta.status === 'ended') {
            renderGameOver();
            return;
        }
        if (gameMeta.status !== 'playing') {
            showScreen('screen-lobby');
            renderLobby();
            return;
        }

        showScreen('screen-game');

        // Phase & round
        $('phase-label').textContent = PHASE_LABELS[gameMeta.phase] || gameMeta.phase || '—';
        $('round-label').textContent = 'Round ' + (gameMeta.round || 1);
        const alive = getLivingPlayers().length;
        $('alive-count').textContent = alive + ' Alive';

        // Role card (prefer privateData while alive)
        const myPlayer = players[myUid] || {};
        const role = privateData.role || myPlayer.role || '—';
        const roleEl = $('my-role');
        roleEl.textContent = role;
        roleEl.className = 'role-name ' + roleClass(role);
        $('my-team').textContent = TEAM[role] || '';

        // Private info
        renderPrivateInfo(role);

        // Action area
        renderActionArea(role);

        // Player grid
        renderPlayerGrid();

        // Night result toast (once)
        if (gameMeta.lastNight && gameMeta.phase === 'voting' && lastPhase !== 'voting') {
            const ln = gameMeta.lastNight;
            let msg = 'Night resolved. ';
            if (ln.mafiaTarget) {
                const n = players[ln.mafiaTarget] ? players[ln.mafiaTarget].name : 'Someone';
                msg += n + ' was killed by Mafia. ';
            }
            if (ln.detectiveEject) {
                const n = players[ln.detectiveEject] ? players[ln.detectiveEject].name : 'Someone';
                msg += n + ' was ejected by Detective. ';
            }
            if (!ln.mafiaTarget && !ln.detectiveEject) {
                msg += 'No one died tonight.';
            }
            toast(msg, 5000);
        }
        if (gameMeta.lastVote && gameMeta.phase === 'mafia' && lastPhase === 'voting') {
            const lv = gameMeta.lastVote;
            if (lv.tie) {
                toast('Vote tied — nobody eliminated.', 4000);
            } else if (lv.eliminated) {
                const n = players[lv.eliminated] ? players[lv.eliminated].name : 'Someone';
                const r = players[lv.eliminated] ? players[lv.eliminated].role : '?';
                toast(n + ' was voted out. Role: ' + r, 5000);
            }
        }
        lastPhase = gameMeta.phase;
    }

    function renderPrivateInfo(role) {
        const el = $('private-info');
        let html = '';

        if (role === 'MAFIA') {
            const teammates = privateData.teammates || [];
            html += '<h4>Your Mafia Partner(s)</h4><ul>';
            if (teammates.length === 0) {
                html += '<li>None (solo or unknown)</li>';
            } else {
                teammates.forEach(tid => {
                    const n = players[tid] ? players[tid].name : tid;
                    html += `<li>${escapeHtml(n)}</li>`;
                });
            }
            html += '</ul>';
        } else if (role === 'JESTER') {
            const known = privateData.knownMafia || [];
            html += '<h4>Known Mafia</h4><ul>';
            if (known.length === 0) {
                html += '<li>—</li>';
            } else {
                known.forEach(tid => {
                    const n = players[tid] ? players[tid].name : tid;
                    html += `<li>${escapeHtml(n)}</li>`;
                });
            }
            html += '</ul>';
            html += '<p class="text-muted" style="margin-top:0.5rem;font-size:0.8rem;">Goal: Get yourself voted out while Mafia still lives.</p>';
        } else if (role === 'DETECTIVE' && privateData.detectiveResult) {
            const dr = privateData.detectiveResult;
            html += '<h4>Last Investigation</h4>';
            if (dr.result === 'SKIPPED') {
                html += '<p>You skipped.</p>';
            } else {
                html += `<p>${escapeHtml(dr.targetName || '?')}: <strong class="${dr.result === 'MAFIA' ? 'text-red' : 'text-green'}">${dr.result}</strong></p>`;
            }
        } else if (role === 'SPY') {
            if (privateData.spyUsed) {
                html += '<h4>SPY POWER USED</h4>';
                if (privateData.spyResult) {
                    const sr = privateData.spyResult;
                    html += `<p>${escapeHtml(sr.targetName || '?')}: <strong>${escapeHtml(sr.role)}</strong></p>`;
                }
            } else {
                html += '<h4>Spy Power</h4><p>One-time: learn exact role of one player.</p>';
            }
        }

        if (!isAlive(myUid)) {
            html += '<p class="text-red" style="margin-top:0.5rem;"><strong>You are dead.</strong> You can still chat and observe.</p>';
        }

        el.innerHTML = html || '<p class="text-muted">No private notes.</p>';
    }

    function renderActionArea(role) {
        const el = $('action-area');
        const statusEl = $('status-area');
        el.innerHTML = '';
        statusEl.innerHTML = '';

        if (gameMeta.status !== 'playing') return;
        if (!isAlive(myUid)) {
            statusEl.innerHTML = '<span class="text-muted">You are dead. Waiting for the living...</span>';
            return;
        }

        const phase = gameMeta.phase;
        const living = getLivingPlayers().filter(p => p.uid !== myUid || true); // all living for targets

        if (phase === 'mafia' && role === 'MAFIA') {
            const already = actions.mafia && actions.mafia[myUid];
            if (already) {
                const tname = players[already] ? players[already].name : '?';
                statusEl.innerHTML = `<span class="done">You selected: ${escapeHtml(tname)}. Waiting for other Mafia...</span>`;
            } else {
                el.innerHTML = '<h3>Choose a player to kill</h3><p>Both Mafia must select. Different choices → random one is chosen.</p>';
                getLivingIds().forEach(id => {
                    if (id === myUid) return; // cannot kill self
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-target';
                    btn.textContent = players[id].name;
                    btn.onclick = () => submitMafiaTarget(id);
                    el.appendChild(btn);
                });
            }
        } else if (phase === 'detective' && role === 'DETECTIVE') {
            if (actions.hasOwnProperty('detective') && actions.detective !== undefined) {
                statusEl.innerHTML = '<span class="done">Investigation submitted.</span>';
            } else {
                el.innerHTML = '<h3>Investigate a player</h3><p>Mafia → learn MAFIA (they stay). Non-Mafia → they are ejected (unless protected).</p>';
                getLivingIds().forEach(id => {
                    if (id === myUid) return;
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-target';
                    btn.textContent = players[id].name;
                    btn.onclick = () => submitDetectiveTarget(id);
                    el.appendChild(btn);
                });
                const skip = document.createElement('button');
                skip.className = 'btn btn-secondary btn-target';
                skip.textContent = 'NOBODY (Skip)';
                skip.onclick = () => submitDetectiveTarget(null);
                el.appendChild(skip);
            }
        } else if (phase === 'doctor' && role === 'DOCTOR') {
            if (actions.doctor) {
                const tname = players[actions.doctor] ? players[actions.doctor].name : '?';
                statusEl.innerHTML = `<span class="done">Protecting: ${escapeHtml(tname)}</span>`;
            } else {
                el.innerHTML = '<h3>Protect a player</h3><p>Protects from Mafia kill and Detective ejection this night. You may protect yourself.</p>';
                getLivingIds().forEach(id => {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-target';
                    btn.textContent = players[id].name + (id === myUid ? ' (You)' : '');
                    btn.onclick = () => submitDoctorProtect(id);
                    el.appendChild(btn);
                });
            }
        } else if (phase === 'spy' && role === 'SPY') {
            if (privateData.spyUsed) {
                statusEl.innerHTML = '<span class="done">SPY POWER USED — skipping to voting.</span>';
                // Auto advance handled by others
            } else if (actions.spy) {
                statusEl.innerHTML = '<span class="done">Spy action submitted.</span>';
            } else {
                el.innerHTML = '<h3>Reveal exact role</h3><p>One-time ability. Choose a living player.</p>';
                getLivingIds().forEach(id => {
                    if (id === myUid) return;
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-target';
                    btn.textContent = players[id].name;
                    btn.onclick = () => submitSpyTarget(id);
                    el.appendChild(btn);
                });
            }
        } else if (phase === 'voting') {
            const myVote = actions.votes && actions.votes[myUid];
            if (myVote) {
                const tname = players[myVote] ? players[myVote].name : '?';
                statusEl.innerHTML = `<span class="done">You voted for: ${escapeHtml(tname)}. Waiting for others...</span>`;
            } else {
                el.innerHTML = '<h3>Vote to eliminate</h3><p>Majority eliminates. Tie = nobody dies. Cannot vote yourself.</p>';
                getLivingIds().forEach(id => {
                    if (id === myUid) return;
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-target';
                    btn.textContent = players[id].name;
                    btn.onclick = () => submitVote(id);
                    el.appendChild(btn);
                });
            }
        } else {
            // Waiting for other roles
            const labels = {
                mafia: 'Mafia is choosing a target...',
                detective: 'Detective is investigating...',
                doctor: 'Doctor is protecting...',
                spy: 'Spy is acting...',
                voting: 'Players are voting...'
            };
            statusEl.innerHTML = `<span class="waiting">${labels[phase] || 'Waiting...'}</span>`;
        }

        // Trigger advance for phases where this player is not the actor (or already acted)
        if (['detective', 'doctor', 'spy'].includes(phase)) {
            setTimeout(() => advancePhaseIfReady(), 800);
        }
        if (phase === 'mafia') {
            setTimeout(() => advancePhaseIfReady(), 1000);
        }
        if (phase === 'voting') {
            setTimeout(() => maybeResolveVoting(), 1000);
        }
    }

    function renderPlayerGrid() {
        const grid = $('player-grid');
        grid.innerHTML = '';
        Object.keys(players).forEach(id => {
            const p = players[id];
            const card = document.createElement('div');
            card.className = 'player-card' + (id === myUid ? ' you' : '') + (p.alive === false ? ' dead' : '');
            const initial = (p.name || '?')[0].toUpperCase();
            let roleHtml = '';
            // Reveal role if dead or game ended
            if (p.alive === false || gameMeta.status === 'ended') {
                if (p.role) {
                    roleHtml = `<div class="pc-role ${roleClass(p.role)}">${escapeHtml(p.role)}</div>`;
                }
            }
            card.innerHTML = `
                <div class="pc-avatar">${escapeHtml(initial)}</div>
                <div class="pc-name">${escapeHtml(p.name || '?')}</div>
                <div class="pc-status">${p.alive === false ? 'Dead' : (p.connected === false ? 'Away' : 'Alive')}</div>
                ${roleHtml}
            `;
            grid.appendChild(card);
        });
    }

    function renderGameOver() {
        showScreen('screen-gameover');
        const winner = gameMeta.winner || 'UNKNOWN';
        const banner = $('winner-banner');
        banner.className = 'winner-banner';
        if (winner === 'MAFIA') {
            banner.textContent = 'MAFIA WIN';
            banner.classList.add('mafia');
        } else if (winner === 'INNOCENTS') {
            banner.textContent = 'INNOCENTS WIN';
            banner.classList.add('innocents');
        } else if (winner === 'JESTER') {
            banner.textContent = 'JESTER WINS';
            banner.classList.add('jester');
        } else {
            banner.textContent = winner;
        }

        const list = $('final-roles');
        list.innerHTML = '';
        Object.keys(players).forEach(id => {
            const p = players[id];
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="fr-name">${escapeHtml(p.name || '?')}${id === myUid ? ' (You)' : ''}</span>
                <span class="fr-role ${roleClass(p.role)}">${escapeHtml(p.role || '?')}</span>
            `;
            list.appendChild(li);
        });
    }

    // ============================================================
    // CHAT
    // ============================================================
    function setupChat(containerId, formId, inputId) {
        const form = $(formId);
        const input = $(inputId);
        const container = $(containerId);
        if (!form || !input || !container) return;

        form.onsubmit = async (e) => {
            e.preventDefault();
            const text = input.value.trim().slice(0, 240);
            if (!text || !myUid || !myName) return;
            input.value = '';
            try {
                await roomRef.child('chat').push({
                    playerId: myUid,
                    name: myName,
                    text: text,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            } catch (err) {
                toast('Chat failed.');
            }
        };
    }

    function listenChat() {
        const chatRef = roomRef.child('chat').limitToLast(50);
        chatRef.on('child_added', (snap) => {
            const msg = snap.val();
            if (!msg) return;
            appendChatMessage(msg, 'chat-messages');
            appendChatMessage(msg, 'chat-messages-lobby');
        });
    }

    function appendChatMessage(msg, containerId) {
        const container = $(containerId);
        if (!container) return;
        // Avoid dupes
        if (container.querySelector(`[data-ts="${msg.timestamp}"]`)) return;
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.dataset.ts = msg.timestamp;
        const isYou = msg.playerId === myUid;
        div.innerHTML = `<span class="sender${isYou ? ' you' : ''}">${escapeHtml(msg.name || '?')}:</span><span class="text">${escapeHtml(msg.text || '')}</span>`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    // ============================================================
    // SUBSCRIPTIONS
    // ============================================================
    function subscribeAll() {
        // Players
        roomRef.child('players').on('value', (snap) => {
            players = snap.val() || {};
            if (gameMeta.status === 'lobby' || !gameMeta.status) {
                renderLobby();
            } else {
                renderGame();
            }
        });

        // Game meta
        roomRef.child('gameMeta').on('value', (snap) => {
            gameMeta = snap.val() || {};
            if (gameMeta.status === 'lobby') {
                showScreen('screen-lobby');
                renderLobby();
            } else if (gameMeta.status === 'playing') {
                renderGame();
            } else if (gameMeta.status === 'ended') {
                renderGameOver();
            }
        });

        // Actions
        roomRef.child('actions').on('value', (snap) => {
            actions = snap.val() || {};
            if (gameMeta.status === 'playing') {
                renderGame();
            }
        });

        // Private data for me
        if (myUid) {
            roomRef.child('privateData/' + myUid).on('value', (snap) => {
                privateData = snap.val() || {};
                if (gameMeta.status === 'playing') {
                    renderGame();
                }
            });
        }

        listenChat();
    }

    // ============================================================
    // RESET / PLAY AGAIN
    // ============================================================
    async function playAgain() {
        // Only allow if ended; reset lobby
        try {
            const updates = {};
            updates['gameMeta/status'] = 'lobby';
            updates['gameMeta/phase'] = null;
            updates['gameMeta/round'] = 0;
            updates['gameMeta/winner'] = null;
            updates['gameMeta/lastNight'] = null;
            updates['gameMeta/lastVote'] = null;
            updates['actions'] = null;
            updates['privateData'] = null;
            // Keep players but clear roles/alive
            Object.keys(players).forEach(id => {
                updates[`players/${id}/role`] = null;
                updates[`players/${id}/alive`] = true;
            });
            // Optional: clear chat
            // updates['chat'] = null;
            await roomRef.update(updates);
            showScreen('screen-lobby');
            toast('Back to lobby. Waiting for 8 players.');
        } catch (e) {
            toast('Reset failed: ' + e.message);
        }
    }

    // ============================================================
    // EVENT BINDINGS
    // ============================================================
    function bindEvents() {
        $('btn-join').onclick = () => {
            const name = $('player-name').value;
            joinRoom(name);
        };
        $('player-name').onkeydown = (e) => {
            if (e.key === 'Enter') joinRoom($('player-name').value);
        };
        $('btn-start').onclick = startGame;
        $('btn-play-again').onclick = playAgain;

        setupChat('chat-messages', 'chat-form', 'chat-input');
        setupChat('chat-messages-lobby', 'chat-form-lobby', 'chat-input-lobby');
    }

    // ============================================================
    // BOOT
    // ============================================================
    async function boot() {
        bindEvents();
        const nameInput = $('player-name');
        if (nameInput) nameInput.value = getStoredName();

        if (!initFirebase()) {
            showScreen('screen-join');
            return;
        }

        try {
            await ensureAuth();
            storePlayerId(myUid);

            // Check if already in room
            const pSnap = await roomRef.child('players/' + myUid).once('value');
            if (pSnap.exists()) {
                const p = pSnap.val();
                myName = p.name || getStoredName() || 'Player';
                storeName(myName);
                setupPresence();
                subscribeAll();
                // status will drive screen
                const mSnap = await roomRef.child('gameMeta').once('value');
                gameMeta = mSnap.val() || {};
                if (gameMeta.status === 'playing') {
                    // private will load
                    showScreen('screen-game');
                } else if (gameMeta.status === 'ended') {
                    showScreen('screen-gameover');
                } else {
                    showScreen('screen-lobby');
                }
            } else {
                showScreen('screen-join');
            }
        } catch (e) {
            console.error(e);
            showScreen('screen-join');
            $('join-error').textContent = 'Connection error: ' + (e.message || 'Check Firebase config & Auth.');
        }
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
