import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  ApplicationVerifier,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { auth } from './firebase';

let confirmationResult: ConfirmationResult | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;

async function initRecaptcha() {
  if (recaptchaVerifier) return;

  let container = document.getElementById('__recaptcha_anchor__');
  if (!container) {
    container = document.createElement('div');
    container.id = '__recaptcha_anchor__';
    container.style.position = 'fixed';
    container.style.bottom = '0px';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
  } else {
    container.innerHTML = '';
  }

  recaptchaVerifier = new RecaptchaVerifier(auth, container, {
    size: 'normal',
    callback: () => {},
    'expired-callback': () => {
      recaptchaVerifier?.clear();
      recaptchaVerifier = null;
    },
  });

  await recaptchaVerifier.render();
}

export async function sendOtp(phoneNumber: string): Promise<void> {
  console.log('[Auth] sendOtp called', { phoneNumber, platform: Platform.OS });

  if (Platform.OS !== 'web') {
    console.log('[Auth] Native path: setting appVerificationDisabledForTesting=true');
    try {
      (auth as any).settings.appVerificationDisabledForTesting = true;
      console.log('[Auth] appVerificationDisabledForTesting set, creating bypass verifier');
      const bypassVerifier = {
        type: 'recaptcha',
        verify: () => {
          console.log('[Auth] bypassVerifier.verify() called');
          return Promise.resolve('');
        },
        _reset: () => { console.log('[Auth] bypassVerifier._reset() called'); },
      } as unknown as ApplicationVerifier;
      console.log('[Auth] calling signInWithPhoneNumber (native)...');
      confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, bypassVerifier);
      console.log('[Auth] signInWithPhoneNumber succeeded (native), verificationId:', (confirmationResult as any).verificationId);
    } catch (e: any) {
      console.error('[Auth] Native sendOtp error:', e.code, e.message, e);
      throw e;
    }
    return;
  }

  // Web: use visible reCAPTCHA
  console.log('[Auth] Web path: initializing reCAPTCHA');
  try {
    await initRecaptcha();
  } catch (e: any) {
    console.error('[Auth] initRecaptcha failed:', e.code, e.message, e);
    throw e;
  }
  if (!recaptchaVerifier) throw new Error('reCAPTCHA לא זמין');
  console.log('[Auth] reCAPTCHA ready, calling signInWithPhoneNumber (web)...');
  try {
    confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
    console.log('[Auth] signInWithPhoneNumber succeeded (web)');
  } catch (e: any) {
    console.error('[Auth] Web sendOtp error:', e.code, e.message, e);
    // Reset so user can try again
    recaptchaVerifier?.clear();
    recaptchaVerifier = null;
    throw e;
  }
}

export async function confirmOtp(otp: string): Promise<FirebaseUser> {
  console.log('[Auth] confirmOtp called, otp length:', otp.length);
  if (!confirmationResult) {
    console.error('[Auth] confirmOtp: no confirmationResult!');
    throw new Error('לא נשלח קוד אימות. שלח קודם SMS.');
  }
  try {
    const result = await confirmationResult.confirm(otp);
    console.log('[Auth] OTP confirmed, uid:', result.user.uid);
    return result.user;
  } catch (e: any) {
    console.error('[Auth] confirmOtp error:', e.code, e.message, e);
    throw e;
  }
}

export function resetRecaptcha() {
  recaptchaVerifier?.clear();
  recaptchaVerifier = null;
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
