import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, ActivityIndicator, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { colors, radii, spacing } from '../constants/theme';
import { sendOtp, confirmOtp, resetRecaptcha } from '../services/auth';
import { createUser, getUser } from '../services/firestore';
import { uploadAvatar } from '../services/storage';
import { useAuth } from '../hooks/useAuth';
import { dlog, getEntries, subscribe, type LogEntry } from '../utils/debugLog';

// ── Firebase health-check (native only) ─────────────────────────────────────
// Runs on mount WITHOUT making any auth calls.
// This tells us whether the RNFB module and Firebase app are accessible at all.
function runFirebaseHealthCheck() {
  if (Platform.OS === 'web') {
    dlog('Platform: web — RNFB not used', 'info');
    return;
  }
  try {
    // Import inline so web bundle is not affected
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rnAuth = require('@react-native-firebase/auth').default;
    dlog('rnAuth module loaded OK');
    const auth = rnAuth();
    dlog(`Firebase app: "${auth.app.name}"`);
    const u = auth.currentUser;
    dlog(`currentUser: ${u ? u.uid : 'null (not signed in)'}`);
  } catch (e: any) {
    dlog(`Firebase health-check FAILED: ${e?.message ?? String(e)}`, 'error');
  }
}

export default function AuthScreen() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();
  // Redirect to map if already logged in
  useEffect(() => {
    if (!authLoading && firebaseUser) {
      router.replace('/(app)/map');
    }
  }, [firebaseUser, authLoading]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');

  // ── Debug log panel ─────────────────────────────────────────────────────
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const logScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Subscribe to log updates
    const unsub = subscribe(() => {
      setLogEntries(getEntries());
      // Auto-scroll to bottom
      setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: true }), 50);
    });
    // Run Firebase health-check immediately
    runFirebaseHealthCheck();
    return unsub;
  }, []);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  }

  async function handleSendOtp() {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 9) { setError('מספר טלפון לא תקין'); return; }
    const intl = '+972' + cleaned.replace(/^0/, '');
    dlog(`handleSendOtp: formatted number = ${intl}`);
    setLoading(true);
    setError('');
    try {
      await sendOtp(intl);
      setOtpSent(true);
    } catch (e: any) {
      resetRecaptcha();
      const msg = e?.message || 'שגיאה לא ידועה';
      dlog(`handleSendOtp catch: ${msg}`, 'error');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!otp || otp.length < 6) { setError('הכנס קוד 6 ספרות'); return; }
    if (mode === 'signup' && !name.trim()) { setError('צריך שם להמשיך'); return; }
    setLoading(true);
    setError('');
    try {
      const fbUser = await confirmOtp(otp);

      const cleaned = phone.replace(/\D/g, '');
      let avatarUrl: string | null = null;
      if (avatarUri) {
        avatarUrl = await uploadAvatar(fbUser.uid, avatarUri);
      }

      if (mode === 'signup') {
        await createUser(fbUser.uid, {
          name: name.trim(),
          phone: cleaned,
          avatarUrl,
          currentRoom: 'A1',
          isAdmin: false,
          createdAt: Date.now(),
        });
      } else {
        const existing = await getUser(fbUser.uid);
        if (!existing) { setError('משתמש לא קיים. הירשם קודם.'); setLoading(false); return; }
      }
      router.replace('/(app)/map');
    } catch (e: any) {
      setError(e.message || 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Invisible recaptcha anchor (web only, hidden) */}
      <View nativeID="recaptcha-container" style={{ height: 0, overflow: 'hidden' }} />

      {/* Brand */}
      <View style={styles.brandRow}>
        <View style={styles.brandIcon}>
          <Text style={styles.brandEmoji}>📍</Text>
        </View>
        <Text style={styles.brandName}>School Map</Text>
      </View>

      <Text style={styles.title}>
        מפה חיה{'\n'}<Text style={styles.titleAccent}>לחברים בבית הספר</Text>
      </Text>
      <Text style={styles.sub}>
        נרשמים פעם אחת עם מספר טלפון. חברים שאישרת יכולים לראות באיזו כיתה אתה נמצא.
      </Text>

      {/* Avatar (signup only) */}
      {mode === 'signup' && (
        <TouchableOpacity style={styles.avatarZone} onPress={pickImage} activeOpacity={0.8}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarIcon}>👤</Text>
            </View>
          )}
          <Text style={[styles.uploadLabel, avatarUri && styles.uploadDone]}>
            {avatarUri ? 'תמונה נבחרה ✓' : 'העלאת תמונת פרופיל'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Name (signup only) */}
      {mode === 'signup' && (
        <View style={styles.field}>
          <Text style={styles.label}>שם שיופיע לחברים</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="לדוגמה: אריאל"
            placeholderTextColor={colors.textFaint}
            maxLength={20}
            textAlign="right"
          />
        </View>
      )}

      {/* Phone */}
      <View style={styles.field}>
        <Text style={styles.label}>מספר טלפון</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="05X-XXXXXXX"
            placeholderTextColor={colors.textFaint}
            keyboardType="phone-pad"
            textAlign="right"
          />
          <TouchableOpacity style={styles.miniBtn} onPress={handleSendOtp} disabled={loading}>
            {loading && !otpSent ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.miniBtnText}>שלח SMS</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* OTP */}
      {otpSent && (
        <View style={styles.field}>
          <Text style={styles.label}>קוד אישור</Text>
          <TextInput
            style={[styles.input, styles.otpInput]}
            value={otp}
            onChangeText={setOtp}
            placeholder="000000"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            maxLength={6}
            textAlign="center"
          />
        </View>
      )}

      {/* CTA */}
      <TouchableOpacity
        style={styles.cta}
        onPress={otpSent ? handleConfirm : handleSendOtp}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.ctaText}>{otpSent ? 'כניסה למפה' : 'שלח קוד SMS'}</Text>
        )}
      </TouchableOpacity>

      {/* Error display */}
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Toggle mode */}
      <TouchableOpacity style={styles.toggleRow} onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
        <Text style={styles.toggleText}>
          {mode === 'signup' ? 'כבר נרשמת? ' : 'עדיין לא נרשמת? '}
          <Text style={styles.toggleLink}>{mode === 'signup' ? 'כניסה' : 'הרשמה'}</Text>
        </Text>
      </TouchableOpacity>

      {/* ── Debug Log Panel ─────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.debugToggle}
        onPress={() => setShowDebug(v => !v)}
        activeOpacity={0.7}
      >
        <Text style={styles.debugToggleText}>
          {showDebug ? '▲ Hide Debug Log' : `▼ Debug Log (${logEntries.length} entries)`}
        </Text>
      </TouchableOpacity>

      {showDebug && (
        <View style={styles.debugBox}>
          <ScrollView
            ref={logScrollRef}
            style={styles.debugScroll}
            onContentSizeChange={() => logScrollRef.current?.scrollToEnd({ animated: false })}
          >
            {logEntries.length === 0 ? (
              <Text style={styles.debugEmpty}>No logs yet...</Text>
            ) : (
              logEntries.map(entry => (
                <Text
                  key={entry.id}
                  style={[
                    styles.debugLine,
                    entry.level === 'error' && styles.debugError,
                    entry.level === 'warn' && styles.debugWarn,
                  ]}
                >
                  {entry.time} {entry.msg}
                </Text>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: 52, paddingBottom: 40 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  brandIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#12345f',
    borderWidth: 1, borderColor: colors.borderBlue,
    alignItems: 'center', justifyContent: 'center',
  },
  brandEmoji: { fontSize: 20 },
  brandName: { fontSize: 15, fontWeight: '800', color: colors.text },
  title: { fontSize: 26, fontWeight: '900', color: colors.text, textAlign: 'center', lineHeight: 32 },
  titleAccent: { color: colors.accent },
  sub: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20, marginVertical: 10, marginHorizontal: 12 },
  avatarZone: { alignItems: 'center', gap: 8, marginBottom: 16 },
  avatarImg: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#10233e',
    borderWidth: 2, borderColor: colors.borderBlue,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarIcon: { fontSize: 36 },
  uploadLabel: { fontSize: 11, color: colors.textMuted },
  uploadDone: { color: '#72dc9c' },
  field: { marginBottom: 14 },
  label: {
    fontSize: 10, fontWeight: '900', color: colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6, textAlign: 'right',
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.lg,
    color: colors.text,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14,
  },
  otpInput: { letterSpacing: 6, fontSize: 18, fontWeight: '900' },
  row: { flexDirection: 'row', gap: 8 },
  miniBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 80,
  },
  miniBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 11, paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  chipSel: { backgroundColor: '#1d5fbd', borderColor: colors.accent },
  chipText: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  chipTextSel: { color: '#fff' },
  cta: {
    height: 51, backgroundColor: colors.primary,
    borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  errorBox: {
    backgroundColor: 'rgba(220,38,38,0.15)',
    borderWidth: 1, borderColor: colors.red,
    borderRadius: radii.md, padding: 10, marginTop: 8,
  },
  errorText: { color: '#ff8a8a', fontSize: 13, textAlign: 'center' },
  toggleRow: { marginTop: 14, alignItems: 'center' },
  toggleText: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },
  toggleLink: { color: colors.accent, fontWeight: '800' },

  // Debug panel styles
  debugToggle: {
    marginTop: 20,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 8,
  },
  debugToggleText: { fontSize: 11, color: '#4a7fa5', fontWeight: '600' },
  debugBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 8,
    backgroundColor: '#050d1a',
    height: 220,
  },
  debugScroll: { flex: 1, padding: 8 },
  debugEmpty: { color: '#4a7fa5', fontSize: 11, textAlign: 'center', marginTop: 8 },
  debugLine: { fontSize: 10, color: '#7fb8e0', fontFamily: 'monospace', lineHeight: 16 },
  debugError: { color: '#ff6b6b' },
  debugWarn: { color: '#ffd166' },
});
