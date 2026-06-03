import { useState, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthChanged } from '../services/auth';
import { db } from '../services/firebase';
import { User } from '../types';

export function useAuth() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null | undefined>(undefined);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const unsubAuth = onAuthChanged((fbUser) => {
      setFirebaseUser(fbUser);
      if (unsubUser) { unsubUser(); unsubUser = null; }

      // Stop the loading spinner as soon as Firebase auth resolves.
      // Don't wait for Firestore — the web SDK hangs on native (no auth token).
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
            // auth is still valid so the map redirect still works.
          },
        );
      } else {
        setAppUser(null);
      }
    });

    // Hard fallback: if onAuthChanged itself never fires (Firebase init failed),
    // unblock the UI after 4 seconds so the user sees the login screen.
    const timeout = setTimeout(() => setLoading(false), 4000);

    return () => { clearTimeout(timeout); unsubAuth(); unsubUser?.(); };
  }, []);

  return { firebaseUser, appUser, setAppUser, loading };
}
