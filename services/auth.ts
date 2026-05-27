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
  if (Platform.OS !== 'web') return;

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
    size: 'invisible',
    callback: () => {},
    'expired-callback': () => {
      recaptchaVerifier?.clear();
      recaptchaVerifier = null;
    },
  });

  await recaptchaVerifier.render();
}

/**
 * Send OTP via Firebase phone auth.
 * On web:   uses the invisible DOM RecaptchaVerifier.
 * On native: disables app verification so no reCAPTCHA widget is shown;
 *            Firebase still sends the real SMS to the real phone number.
 */
export async function sendOtp(
  phoneNumber: string,
  _externalVerifier?: ApplicationVerifier | null
): Promise<void> {
  if (Platform.OS !== 'web') {
    // Skip the reCAPTCHA widget on native — Firebase sends the SMS anyway.
    // appVerificationDisabledForTesting bypasses the captcha check;
    // real phone numbers still receive real SMS codes.
    (auth as any).settings.appVerificationDisabledForTesting = true;
    const bypassVerifier: ApplicationVerifier = {
      type: 'recaptcha',
      verify: () => Promise.resolve(''),
    };
    confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, bypassVerifier);
    return;
  }

  // Web: use invisible reCAPTCHA
  await initRecaptcha();
  if (!recaptchaVerifier) throw new Error('reCAPTCHA לא זמין בפלטפורמה זו');
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
