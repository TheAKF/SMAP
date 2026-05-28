import rnAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { dlog } from '../utils/debugLog';

let confirmationResult: FirebaseAuthTypes.ConfirmationResult | null = null;

export async function sendOtp(phoneNumber: string): Promise<void> {
  dlog(`sendOtp START: ${phoneNumber}`);
  try {
    dlog('Step 1: calling rnAuth()...');
    const auth = rnAuth();
    dlog(`Step 1 OK - app name: "${auth.app.name}"`);

    // Disable app verification so Firebase skips APNs/reCAPTCHA lookup.
    // Required on sideloaded builds where APNs is unavailable and CLIENT_ID
    // is missing from the plist. Works with Firebase test phone numbers.
    // TODO: remove this line once CLIENT_ID is added to GoogleService-Info.plist
    auth.settings.appVerificationDisabledForTesting = true;

    dlog('Step 2: calling signInWithPhoneNumber...');
    confirmationResult = await auth.signInWithPhoneNumber(phoneNumber);
    dlog('Step 2 OK - SMS sent!');
  } catch (e: any) {
    const code = e?.code ?? 'no-code';
    const msg = e?.message ?? String(e);
    dlog(`sendOtp FAILED - code: ${code}`, 'error');
    dlog(`sendOtp FAILED - msg: ${msg}`, 'error');
    throw e;
  }
}

export async function confirmOtp(otp: string): Promise<FirebaseAuthTypes.User> {
  dlog(`confirmOtp START - length: ${otp.length}`);
  if (!confirmationResult) {
    dlog('confirmOtp ERROR: no confirmationResult', 'error');
    throw new Error('לא נשלח קוד אימות. שלח קודם SMS.');
  }
  try {
    dlog('Calling confirmationResult.confirm()...');
    const result = await confirmationResult.confirm(otp);
    if (!result) throw new Error('אימות נכשל');
    dlog(`confirmOtp OK - uid: ${result.user.uid}`);
    return result.user;
  } catch (e: any) {
    const code = e?.code ?? 'no-code';
    const msg = e?.message ?? String(e);
    dlog(`confirmOtp FAILED - code: ${code}`, 'error');
    dlog(`confirmOtp FAILED - msg: ${msg}`, 'error');
    throw e;
  }
}

export function resetRecaptcha() {
  dlog('resetRecaptcha called');
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
