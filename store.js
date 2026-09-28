// Capa de dades: Firebase Firestore si hi ha configuració, o localStorage (mode demo) si no.
import { firebaseConfig } from './firebase-config.js';

export const COLLECTIONS = ['people', 'bookings', 'requests', 'holidays', 'incidents'];
const FIREBASE_VERSION = '10.12.2';

export async function createStore(seed) {
  if (firebaseConfig && firebaseConfig.apiKey) return firebaseStore(firebaseConfig, seed);
  return localStore(seed);
}

// ---------- Mode demo (localStorage) ----------
function localStore(seed) {
  const KEY = 'tablets-demo-db-v1';
  const listeners = {};
  let db = null;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const load = () => {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  };
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* sense emmagatzematge */ }
  };
  const list = (col) => Object.entries(db[col] || {}).map(([id, d]) => ({ id, ...d }));
  const emit = (col) => (listeners[col] || []).forEach((cb) => cb(list(col)));
  const init = () => {
    db = {};
    COLLECTIONS.forEach((c) => (db[c] = {}));
    seed.people.forEach((p) => (db.people[uid()] = p));
    persist();
  };

  load();
  if (!db) init();
  COLLECTIONS.forEach((c) => (db[c] ||= {}));

  // Sincronitza entre pestanyes del mateix navegador
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    load();
    if (!db) init();
    COLLECTIONS.forEach(emit);
  });

  return {
    mode: 'demo',
    subscribe(col, cb) {
      (listeners[col] ||= []).push(cb);
      cb(list(col));
    },
    async add(col, data) {
      const id = uid();
      db[col][id] = data;
      persist();
      emit(col);
      return id;
    },
    async update(col, id, patch) {
      if (!db[col][id]) return;
      Object.assign(db[col][id], patch);
      persist();
      emit(col);
    },
    async remove(col, id) {
      delete db[col][id];
      persist();
      emit(col);
    },
    reset() {
      init();
      COLLECTIONS.forEach(emit);
    },
  };
}

// ---------- Firebase ----------
async function firebaseStore(cfg, seed) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [appMod, fs, authMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
    import(`${base}/firebase-auth.js`),
  ]);
  const app = appMod.initializeApp(cfg);
  // Sessió anònima: no demana contrasenya, però impedeix escriure a la base de dades des de fora de l'app.
  await authMod.signInAnonymously(authMod.getAuth(app));
  const db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true });

  const peopleSnap = await fs.getDocs(fs.collection(db, 'people'));
  if (peopleSnap.empty) {
    for (const p of seed.people) await fs.addDoc(fs.collection(db, 'people'), p);
  }

  return {
    mode: 'firebase',
    subscribe(col, cb) {
      return fs.onSnapshot(
        fs.collection(db, col),
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error(`Error llegint ${col}:`, err)
      );
    },
    async add(col, data) {
      const ref = await fs.addDoc(fs.collection(db, col), data);
      return ref.id;
    },
    async update(col, id, patch) {
      await fs.updateDoc(fs.doc(db, col, id), patch);
    },
    async remove(col, id) {
      await fs.deleteDoc(fs.doc(db, col, id));
    },
  };
}
