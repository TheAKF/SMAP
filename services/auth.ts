import {
  signInWithPhoneNumber,
  ConfirmationResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  ApplicationVerifier,
} from 'firebase/auth';
import { auth } from './firebase';

let confirmationResult: ConfirmationResult | null = null;

export async function sendOtp(phoneNumber: string): Promise<void> {
  // Bypass reCAPTCHA on all platforms — Firebase still sends the real SMS.
  (auth as any).settings.appVerificationDisabledForTesting = true;
  const bypassVerifier: ApplicationVerifier = {
    type: 'recaptcha',
    verify: () => Promise.resolve(''),
  };
  confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, bypassVerifier);
}

export async function confirmOtp(otp: string): Promise<FirebaseUser> {
  if (!confirmationResult) throw new Error('לא נשלח קוד אימות. שלח קודם SMS.');
  const result = await confirmationResult.confirm(otp);
  return result.user;
}

export function resetRecaptcha() {
  confirmationResult = null;
}

export function signOut() {
  return firebaseSignOut(auth);
}

export function onAuthChanged(cb: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export function currentUser() {
  return auth.currentUser;
}
