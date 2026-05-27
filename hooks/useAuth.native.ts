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

      if (fbUser) {
        unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
          setAppUser(snap.exists() ? (snap.data() as User) : null);
          setLoading(false);
        });
      } else {
        setAppUser(null);
        setLoading(false);
      }
    });

    return () => { unsubAuth(); unsubUser?.(); };
  }, []);

  return { firebaseUser, appUser, setAppUser, loading };
}
