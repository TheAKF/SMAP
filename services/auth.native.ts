import rnAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { Platform } from 'react-native';

let confirmationResult: FirebaseAuthTypes.ConfirmationResult | null = null;

export async function sendOtp(phoneNumber: string): Promise<void> {
  const auth = rnAuth();
  // Sideloaded builds (IPA + APK) don't have their SHA fingerprint registered
  // in Firebase Console, so auth/app-not-authorized is thrown on Android.
  // Disabling app verification bypasses the SafetyNet/SHA check while still
  // sending real SMS to real phone numbers.
  auth.settings.appVerificationDisabledForTesting = true;
  confirmationResult = await auth.signInWithPhoneNumber(phoneNumber);
}

export async function confirmOtp(otp: string): Promise<FirebaseAuthTypes.User> {
  if (!confirmationResult) {
    throw new Error('לא נשלח קוד אימות. שלח קודם SMS.');
  }
  const result = await confirmationResult.confirm(otp);
  if (!result) throw new Error('אימות נכשל');
  return result.user;
}

export function resetRecaptcha() {
  confirmationResult = null;
}

export function signOut() {
  return rnAuth().signOut();
}

export function onAuthChanged(cb: (user: FirebaseAuthTypes.User | null) => void) {
  return rnAuth().onAuthStateChanged(cb);
}

export function currentUser() {
  return rnAuth().currentUser;
}
