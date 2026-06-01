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

    // Safety-net: if Firebase or Firestore hangs on native and neither the
    // auth callback nor the snapshot callback fires within 6 seconds, force
    // loading off so the user sees the login screen instead of a frozen spinner.
    const timeout = setTimeout(() => setLoading(false), 6000);

    const unsubAuth = onAuthChanged((fbUser) => {
      setFirebaseUser(fbUser);
      if (unsubUser) { unsubUser(); unsubUser = null; }

      if (fbUser) {
        // Listen to user doc in real-time — picks up changes immediately after signup
        unsubUser = onSnapshot(
          doc(db, 'users', fbUser.uid),
          (snap) => {
            clearTimeout(timeout);
            setAppUser(snap.exists() ? (snap.data() as User) : null);
            setLoading(false);
          },
          (_err) => {
            // Firestore error (e.g. permission denied) — still stop loading so the
            // map redirect can happen. appUser stays null but auth is still valid.
            clearTimeout(timeout);
            setLoading(false);
          },
        );
      } else {
        clearTimeout(timeout);
        setAppUser(null);
        setLoading(false);
      }
    });

    return () => { clearTimeout(timeout); unsubAuth(); unsubUser?.(); };
  }, []);

  return { firebaseUser, appUser, setAppUser, loading };
}
