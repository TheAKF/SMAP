import rnAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

let confirmationResult: FirebaseAuthTypes.ConfirmationResult | null = null;

export async function sendOtp(phoneNumber: string): Promise<void> {
  const auth = rnAuth();
  // Bypass reCAPTCHA for Firebase test phone numbers
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
