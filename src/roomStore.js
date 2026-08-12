import { firebaseConfig, isFirebaseConfigured } from "./firebaseConfig.js";

// ---------------------------------------------------------------------
// A tiny key-value "room" store with two backends:
//  - Firestore (real cross-device sync) when firebaseConfig.js is filled in
//  - localStorage + BroadcastChannel (same-device / same-browser only)
//    as a zero-setup fallback so the app still works out of the box.
// ---------------------------------------------------------------------

let firestorePromise = null;
async function getFirestore() {
  if (!firestorePromise) {
    firestorePromise = (async () => {
      const { initializeApp } = await import("firebase/app");
      const { getFirestore, doc, setDoc, onSnapshot, getDoc } = await import(
        "firebase/firestore"
      );
      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      return { db, doc, setDoc, onSnapshot, getDoc };
    })();
  }
  return firestorePromise;
}

const LOCAL_PREFIX = "cardtable_room_";
const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("cardtable") : null;

export async function getRoom(roomCode) {
  if (isFirebaseConfigured) {
    const { db, doc, getDoc } = await getFirestore();
    const snap = await getDoc(doc(db, "rooms", roomCode));
    return snap.exists() ? snap.data() : null;
  }
  const raw = localStorage.getItem(LOCAL_PREFIX + roomCode);
  return raw ? JSON.parse(raw) : null;
}

export async function setRoom(roomCode, data) {
  if (isFirebaseConfigured) {
    const { db, doc, setDoc } = await getFirestore();
    await setDoc(doc(db, "rooms", roomCode), data);
    return;
  }
  localStorage.setItem(LOCAL_PREFIX + roomCode, JSON.stringify(data));
  channel?.postMessage({ roomCode });
}

// Calls onChange(data) whenever the room updates. Returns an unsubscribe fn.
export function subscribeRoom(roomCode, onChange) {
  if (isFirebaseConfigured) {
    let unsub = () => {};
    (async () => {
      const { db, doc, onSnapshot } = await getFirestore();
      unsub = onSnapshot(doc(db, "rooms", roomCode), (snap) => {
        if (snap.exists()) onChange(snap.data());
      });
    })();
    return () => unsub();
  }

  const handler = (e) => {
    if (e?.data?.roomCode && e.data.roomCode !== roomCode) return;
    const raw = localStorage.getItem(LOCAL_PREFIX + roomCode);
    if (raw) onChange(JSON.parse(raw));
  };
  channel?.addEventListener("message", handler);
  // Poll as a safety net (covers the case where BroadcastChannel isn't available)
  const interval = setInterval(handler, 2500);
  return () => {
    channel?.removeEventListener("message", handler);
    clearInterval(interval);
  };
}

export { isFirebaseConfigured };
