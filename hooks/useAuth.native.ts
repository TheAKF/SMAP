import { useState, useEffect } from 'react';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthChanged } from '../services/auth';
import { db } from '../services/firebase';
import { User } from '../types';

export function useAuth() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseAuthTypes.User | null | undefined>(undefined);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const unsubAuth = onAuthChanged((fbUser) => {
      setFirebaseUser(fbUser);
      if (unsubUser) { unsubUser(); unsubUser = null; }

      // Unblock the UI immediately — don't wait for Firestore.
      // The web SDK Firestore has no RNFB auth token on native, so
      // onSnapshot may fail silently and never call back.
      // appUser will update in the background if/when Firestore responds.
      setLoading(false);

      if (fbUser) {
        unsubUser = onSnapshot(
          doc(db, 'users', fbUser.uid),
          (snap) => {
            setAppUser(snap.exists() ? (snap.data() as User) : null);
          },
          (_err) => {
            // Firestore permission error on native — appUser stays null,
            // RNFB auth is still valid so the map redirect still works.
          },
        );
      } else {
        setAppUser(null);
      }
    });

    // Hard fallback: if onAuthStateChanged itself never fires
    // (e.g. Firebase native not initialised), unblock after 4 s.
    const timeout = setTimeout(() => setLoading(false), 4000);

    return () => { clearTimeout(timeout); unsubAuth(); unsubUser?.(); };
  }, []);

  return { firebaseUser, appUser, setAppUser, loading };
}
