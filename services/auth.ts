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
  if (Platform.OS !== 'web') {
    // Native: bypass reCAPTCHA — Firebase still sends the real SMS.
    (auth as any).settings.appVerificationDisabledForTesting = true;
    const bypassVerifier = {
      type: 'recaptcha',
      verify: () => Promise.resolve(''),
      _reset: () => {},
    } as unknown as ApplicationVerifier;
    confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, bypassVerifier);
    return;
  }

  // Web: use visible reCAPTCHA (user checks the box once, then SMS is sent)
  await initRecaptcha();
  if (!recaptchaVerifier) throw new Error('reCAPTCHA לא זמין');
  confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
}

export async function confirmOtp(otp: string): Promise<FirebaseUser> {
  if (!confirmationResult) throw new Error('לא נשלח קוד אימות. שלח קודם SMS.');
  const result = await confirmationResult.confirm(otp);
  return result.user;
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
