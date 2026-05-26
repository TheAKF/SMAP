import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  ApplicationVerifier,
  initializeRecaptchaConfig,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { auth } from './firebase';

// Pre-warm the reCAPTCHA Enterprise config on web so the first sendOtp call
// doesn't fail with "Failed to initialize reCAPTCHA Enterprise config".
if (Platform.OS === 'web') {
  initializeRecaptchaConfig(auth).catch(() => {
    // Silently ignore — falls back to reCAPTCHA v2 automatically
  });
}

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
 * On web: uses the invisible reCAPTCHA verifier created internally.
 * On native: pass the ref from <FirebaseRecaptchaVerifierModal> as `externalVerifier`.
 */
export async function sendOtp(
  phoneNumber: string,
  externalVerifier?: ApplicationVerifier | null
): Promise<void> {
  let verifier: ApplicationVerifier;

  if (externalVerifier) {
    verifier = externalVerifier;
  } else {
    await initRecaptcha();
    if (!recaptchaVerifier) throw new Error('reCAPTCHA לא זמין בפלטפורמה זו');
    verifier = recaptchaVerifier;
  }

  confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
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
