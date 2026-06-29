import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

let app = null;
let db = null;

if (hasFirebaseConfig) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export function subscribeTransactions(callback, onError) {
  if (!db) return null;

  return onSnapshot(
    collection(db, "transactions"),
    snapshot => {
      const rows = snapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
      }));

      callback(rows);
    },
    onError
  );
}

export async function createTransaction(data) {
  if (!db) throw new Error("Firebase is not configured.");

  return addDoc(collection(db, "transactions"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateTransaction(id, data) {
  if (!db) throw new Error("Firebase is not configured.");

  return updateDoc(doc(db, "transactions", id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteTransaction(id) {
  if (!db) throw new Error("Firebase is not configured.");

  return deleteDoc(doc(db, "transactions", id));
}
