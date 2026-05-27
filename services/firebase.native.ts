// Native-only Firebase initialisation.
// Does NOT import firebase/auth — native auth is handled by @react-native-firebase/auth.
// Importing firebase/auth on native triggers the "Unable to load external scripts" error
// because the web SDK tries to load reCAPTCHA scripts at startup.

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyB7enX7UU4TuhmEF94iSOoZAP0rl249taE",
  authDomain: "smap-f893f.firebaseapp.com",
  projectId: "smap-f893f",
  storageBucket: "smap-f893f.firebasestorage.app",
  messagingSenderId: "920361704345",
  appId: "1:920361704345:web:99471219264ccb6e9a1108",
  measurementId: "G-MZNMDMN9W9"
};

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// auth is intentionally NOT exported here — use @react-native-firebase/auth instead
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export default app;
