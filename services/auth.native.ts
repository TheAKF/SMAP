import rnAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

let confirmationResult: FirebaseAuthTypes.ConfirmationResult | null = null;

export async function sendOtp(phoneNumber: string): Promise<void> {
  console.log('[Auth] sendOtp (native)', { phoneNumber });
  try {
    confirmationResult = await rnAuth().signInWithPhoneNumber(phoneNumber);
    console.log('[Auth] SMS sent successfully (native)');
  } catch (e: any) {
    console.error('[Auth] sendOtp error:', e.code, e.message);
    throw e;
  }
}

export async function confirmOtp(otp: string): Promise<FirebaseAuthTypes.User> {
  console.log('[Auth] confirmOtp (native), otp length:', otp.length);
  if (!confirmationResult) {
    console.error('[Auth] no confirmationResult — sendOtp was not called');
    throw new Error('לא נשלח קוד אימות. שלח קודם SMS.');
  }
  try {
    const result = await confirmationResult.confirm(otp);
    if (!result) throw new Error('אימות נכשל');
    console.log('[Auth] OTP confirmed, uid:', result.user.uid);
    return result.user;
  } catch (e: any) {
    console.error('[Auth] confirmOtp error:', e.code, e.message);
    throw e;
  }
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
