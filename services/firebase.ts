import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// TODO: Replace with your Firebase project config from https://console.firebase.google.com
// Project settings → Your apps → Web app → Config
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

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export default app;
