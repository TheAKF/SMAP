import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet, ScrollView,
  TextInput, Alert, Image, Animated, Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  setupNotificationHandler, registerForPushNotifications, addNotificationResponseListener,
} from '../../services/pushNotifications';
import {
  registerTeacherPollTask, unregisterTeacherPollTask,
} from '../../services/teacherPoll';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radii, spacing } from '../../constants/theme';
import {
  ALL_ROOMS, ALLOWED_TEACHER_ROOMS, FLOOR_ROOMS,
  DEFAULT_STICKERS, EMOJI_BANK, ROOM_COORDS,
} from '../../constants/rooms';
import { Teacher } from '../../types';
import {
  updateUserRoom, updateUserProfile, setUserBubble, saveCustomStickers,
  listenFriendsLive, FriendLive, approveFriendship, sendFriendRequest,
  addTeacher, voteOnTeacher, listenTeachers,
  sendMessage, listenMessages,
  sendStickerRequest, broadcastStickerBurst, listenStickerBursts, StickerBurst,
  listenStickerRequests,
} from '../../services/firestore';
import { uploadAvatar, uploadStickerImage } from '../../services/storage';
import { signOut, currentUser } from '../../services/auth';
import { getUser } from '../../services/firestore';
import { useAuth } from '../../hooks/useAuth';
import FloorMap from '../../components/FloorMap';
import Sheet, { SheetTitle, SheetSub, SheetBtn } from '../../components/Sheet';
import ChatView from '../../components/ChatView';

type SheetType =
  | 'room-picker' | 'friends' | 'teachers'
  | 'stickers' | 'bubble' | 'profile'
  | { type: 'confirm-room'; room: string }
  | { type: 'friend-actions'; id: string }
  | { type: 'chat'; id: string }
  | { type: 'call'; id: string }
  | null;

const { width: SW, height: SH } = Dimensions.get('window');

// Show notifications even when app is in foreground (no-op on web)
setupNotificationHandler();

function StickerOverlayItem({
  sticker, fromName, onDone,
}: { sticker: string; fromName: string; onDone: () => void }) {
  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const posX    = useRef(SW * 0.08 + Math.random() * SW * 0.55).current;
  const posY    = useRef(SH * 0.12 + Math.random() * SH * 0.45).current;
  const rot     = useRef(`${(Math.random() - 0.5) * 28}deg`).current;
  const isImg   = sticker.startsWith('http') || sticker.startsWith('blob:');

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.4, useNativeDriver: true, damping: 5, stiffness: 320 }),
      Animated.spring(scale, { toValue: 1.0, useNativeDriver: true, damping: 14 }),
      Animated.delay(1800),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 550, useNativeDriver: true }),
        Animated.timing(scale,   { toValue: 0.4, duration: 550, useNativeDriver: true }),
      ]),
    ]).start(() => onDone());
  }, []);

  return (
    <Animated.View
      style={[overlayStyles.item, {
        left: posX, top: posY,
        opacity, transform: [{ scale }, { rotate: rot }],
      }]}
      pointerEvents="none"
    >
      {isImg
        ? <Image source={{ uri: sticker }} style={overlayStyles.imgSticker} />
        : <Text style={overlayStyles.emojiSticker}>{sticker}</Text>}
      <View style={overlayStyles.nameBadge}>
        <Text style={overlayStyles.nameBadgeText}>{fromName}</Text>
      </View>
    </Animated.View>
  );
}

const overlayStyles = StyleSheet.create({
  item: { position: 'absolute', zIndex: 999, alignItems: 'center' },
  emojiSticker: { fontSize: 72 },
  imgSticker: { width: 90, height: 90, borderRadius: 14 },
  nameBadge: { backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  nameBadgeText: { fontSize: 11, fontWeight: '900', color: '#fff' },
});

function HoldSendBtn({ label, icon, onSend }: { label: string; icon?: string; onSend: () => void }) {
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend; // always point to the latest version

  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear interval when component unmounts (e.g. when sticker key changes blob→url during upload)
  useEffect(() => {
    return () => {
      if (interval.current) { clearInterval(interval.current); interval.current = null; }
    };
  }, []);

  function start() {
    onSendRef.current();
    interval.current = setInterval(() => onSendRef.current(), 500);
  }
  function stop() {
    if (interval.current) { clearInterval(interval.current); interval.current = null; }
  }

  return (
    <Pressable
      style={({ pressed }) => [holdStyles.btn, pressed && holdStyles.btnPressed]}
      onPressIn={start}
      onPressOut={stop}
    >
      {({ pressed }) =>
        icon
          ? <Image source={{ uri: icon }} style={holdStyles.icon} />
          : <Text style={holdStyles.text}>{pressed ? '🔥 ' : ''}{label}</Text>
      }
    </Pressable>
  );
}

const holdStyles = StyleSheet.create({
  btn: {
    backgroundColor: '#1e40af',
    borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  btnPressed: { backgroundColor: '#3b82f6', transform: [{ scale: 0.95 }] },
  text: { fontSize: 13, fontWeight: '900', color: '#fff' },
  icon: { width: 36, height: 36, borderRadius: 8 },
});

export default function MapScreen() {
  const router = useRouter();
  const { appUser, setAppUser } = useAuth();
  const fbUser = currentUser();

  const [floor, setFloor] = useState<0 | 1 | 2>(1);
  const [currentRoom, setCurrentRoom] = useState(appUser?.currentRoom ?? 'A5');
  const [friends, setFriends] = useState<FriendLive[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sheet, setSheet] = useState<SheetType>(null);
  const [stickers, setStickers] = useState<string[]>(() =>
    appUser?.customStickers?.length ? appUser.customStickers : DEFAULT_STICKERS
  );
  const stickersLoadedRef = useRef(false);
  // Always holds the latest stickers value so async callbacks can read it without stale closures
  const stickersRef = useRef(stickers);
  useEffect(() => { stickersRef.current = stickers; });
  const [selectedStickerForPicker, setSelectedStickerForPicker] = useState<string>('');
  const [stickerTarget, setStickerTarget] = useState<FriendLive | null>(null);
  const [stickerBursts, setStickerBursts] = useState<StickerBurst[]>([]);
  const [stickerOverlays, setStickerOverlays] = useState<Array<{ id: string; sticker: string; fromName: string }>>([]);
  const shownStickerIds = useRef<Set<string>>(new Set());
  const shownBurstIds = useRef<Set<string>>(new Set());
  const stickerListenStart = useRef(Date.now());
  const [bubbleText, setBubbleText] = useState('');
  const [userBubble, setUserBubble_] = useState<{ room: string; text: string } | null>(null);
  const [profileName, setProfileName] = useState(appUser?.name ?? '');
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [teacherRoomIdx, setTeacherRoomIdx] = useState(0);
  const [addFriendPhone, setAddFriendPhone] = useState('');
  const [reportEmojis, setReportEmojis] = useState<string[]>([]);

  useEffect(() => {
    if (!fbUser) return;
    const unsub = listenFriendsLive(fbUser.uid, setFriends);
    const unsubT = listenTeachers(setTeachers);
    const unsubS = listenStickerBursts((bursts) => {
      bursts
        .filter((b) => !shownBurstIds.current.has(b.id))
        .forEach((b) => {
          shownBurstIds.current.add(b.id);
          // Cap at 8 concurrent bursts so we don't flood the animator
          setStickerBursts((prev) => {
            const next = [...prev, b];
            return next.slice(-8);
          });
          setTimeout(() => setStickerBursts((prev) => prev.filter((x) => x.id !== b.id)), 3500);
        });
    });
    const unsubReqs = listenStickerRequests(fbUser.uid, (reqs) => {
      reqs
        .filter((r) => r.sentAt > stickerListenStart.current && !shownStickerIds.current.has(r.id))
        .forEach((r) => {
          shownStickerIds.current.add(r.id);
          // Cap at 5 concurrent overlays to prevent animation crash
          setStickerOverlays((prev) => {
            const next = [...prev, { id: r.id, sticker: r.sticker, fromName: r.fromName }];
            return next.slice(-5);
          });
        });
    });
    return () => { unsub(); unsubT(); unsubS(); unsubReqs(); };
  }, [fbUser]);

  // ── Push notifications + background teacher poll ─────────────────────────
  useEffect(() => {
    if (!fbUser) return;

    // Save Expo push token to Firestore (no-op on web)
    registerForPushNotifications(fbUser.uid);

    // Register background task that fires every ~5 min even when app is closed
    registerTeacherPollTask(fbUser.uid);

    // When user taps a teacher-poll notification → open teachers sheet
    const sub = addNotificationResponseListener(() => setSheet('teachers'));
    return () => {
      sub.remove();
      unregisterTeacherPollTask();
    };
  }, [fbUser?.uid]);

  // Seed stickers once via a direct read (not onSnapshot which fires from cache first).
  // stickersLoadedRef gates both this effect and the persist effect below.
  useEffect(() => {
    if (!fbUser || stickersLoadedRef.current) return;
    getUser(fbUser.uid).then((user) => {
      stickersLoadedRef.current = true;
      if (user?.customStickers?.length) setStickers(user.customStickers);
    });
  }, [fbUser?.uid]);

  // Persist sticker changes — only save permanent URLs, not temporary blob/file URIs
  useEffect(() => {
    if (!fbUser || !stickersLoadedRef.current) return;
    const permanent = stickers.filter((s) => !s.startsWith('blob:') && !s.startsWith('file://') && !s.startsWith('content://'));
    saveCustomStickers(fbUser.uid, permanent).catch(() => {});
  }, [stickers]);

  // Sync currentRoom when appUser loads
  useEffect(() => {
    if (appUser?.currentRoom) {
      setCurrentRoom(appUser.currentRoom);
      setFloor((ROOM_COORDS[appUser.currentRoom]?.f ?? 1) as 0 | 1 | 2);
    }
  }, [appUser?.uid]);

  // Auto-expire teacher reports after 30 min
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 30 * 60 * 1000;
      setTeachers((prev) => prev.filter((t) => t.lastPoll >= cutoff));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const approvedFriends = friends.filter((f) => f.status === 'approved');
  const isImgSticker = (s: string) => s.startsWith('http') || s.startsWith('blob:') || s.startsWith('file://') || s.startsWith('content://');

  async function addImageSticker() {
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.6 });
    if (result.canceled || !fbUser) return;
    const localUri = result.assets[0].uri;
    setStickers((prev) => [localUri, ...prev]);
    try {
      const url = await uploadStickerImage(fbUser.uid, localUri);
      // Use functional updater to capture the exact post-upload list, then save it
      let savedList: string[] = [];
      setStickers((prev) => {
        const next = prev.map((s) => s === localUri ? url : s);
        savedList = next;
        return next;
      });
      // Wait one microtask so the setter runs and savedList is populated
      await Promise.resolve();
      const permanent = savedList.filter(
        (s) => !s.startsWith('blob:') && !s.startsWith('file://') && !s.startsWith('content://'),
      );
      stickersLoadedRef.current = true;
      await saveCustomStickers(fbUser.uid, permanent);
    } catch (e: any) {
      Alert.alert('שגיאה בהעלאה', e?.message ?? 'נסה שוב');
      setStickers((prev) => prev.filter((s) => s !== localUri));
    }
  }

  async function changeRoom(room: string) {
    setCurrentRoom(room);
    setFloor((ROOM_COORDS[room]?.f ?? 1) as 0 | 1 | 2);
    if (fbUser) await updateUserRoom(fbUser.uid, room);
    if (appUser) setAppUser({ ...appUser, currentRoom: room });
    setSheet(null);
  }

  async function handleAddFriend() {
    if (!fbUser) return;
    const result = await sendFriendRequest(fbUser.uid, addFriendPhone.replace(/\D/g, ''));
    Alert.alert(result === 'sent' ? 'נשלח ✓' : 'לא נמצא', result === 'sent' ? 'בקשת חברות נשלחה' : 'לא נמצא משתמש עם המספר הזה');
    setAddFriendPhone('');
  }

  async function handleAddTeacher() {
    if (!fbUser) return;
    const room = ALLOWED_TEACHER_ROOMS[teacherRoomIdx] ?? ALLOWED_TEACHER_ROOMS[0];
    const emojiStr = reportEmojis.join('');
    const label = emojiStr ? emojiStr + ' ' + teacherName : teacherName;
    await addTeacher({ name: label || 'מורה', room, reportedBy: fbUser.uid, lastPoll: Date.now(), confirmed: true, emojis: reportEmojis });
    setTeacherName('');
    setReportEmojis([]);
    setSheet(null);
  }

  async function showBubble(room: string, text: string) {
    setUserBubble_({ room, text });
    if (fbUser) await setUserBubble(fbUser.uid, text);
    setTimeout(() => {
      setUserBubble_(null);
      if (fbUser) setUserBubble(fbUser.uid, null);
    }, 5 * 60 * 1000);
  }

  async function handleProfileSave() {
    if (!fbUser || !appUser) return;
    let avatarUrl = appUser.avatarUrl;
    if (profileAvatarUri) avatarUrl = await uploadAvatar(fbUser.uid, profileAvatarUri);
    await updateUserProfile(fbUser.uid, { name: profileName, avatarUrl });
    setAppUser({ ...appUser, name: profileName, avatarUrl });
    setSheet(null);
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  const renderFriendRow = (f: FriendLive) => {
    const isApproved = f.status === 'approved';
    const iReceived  = !isApproved && f.requestedBy !== fbUser?.uid;
    const iSent      = !isApproved && f.requestedBy === fbUser?.uid;
    return (
      <View key={f.friendshipId} style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.friendAvatar, { backgroundColor: f.color }]}>
            <Text style={styles.friendAvatarLetter}>{f.name[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{f.name}</Text>
            <Text style={styles.cardSub}>
              {isApproved
                ? `📍 נמצא/ת ב-${f.room}`
                : iSent
                  ? '⏳ ממתין לאישור'
                  : '🔔 שלח/ה לך בקשת חברות'}
            </Text>
          </View>
          {/* Only the RECEIVER sees the Accept button — sender waits */}
          {iReceived && (
            <TouchableOpacity style={styles.pill} onPress={() => approveFriendship(f.friendshipId)}>
              <Text style={styles.pillText}>אשר</Text>
            </TouchableOpacity>
          )}
          {isApproved && (
            <TouchableOpacity style={styles.pill} onPress={() => setSheet({ type: 'friend-actions', id: f.uid })}>
              <Text style={styles.pillText}>פעולות</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ── Sheet content ─────────────────────────────────────────────────────────

  function renderSheetContent() {
    if (!sheet) return null;

    if (sheet === 'room-picker') {
      return (
        <>
          <SheetTitle>איפה אתה עכשיו?</SheetTitle>
          <SheetSub>בחר כיתה מהרשימה</SheetSub>
          <View style={styles.roomGrid}>
            {ALL_ROOMS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.roomBtn, r === currentRoom && styles.roomBtnSel]}
                onPress={() => changeRoom(r)}
              >
                <Text style={[styles.roomBtnText, r === currentRoom && { color: '#fff' }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      );
    }

    if (typeof sheet === 'object' && sheet.type === 'confirm-room') {
      return (
        <>
          <SheetTitle>האם זאת הכיתה הנכונה?</SheetTitle>
          <SheetSub>{`בחרת ${sheet.room}`}</SheetSub>
          <SheetBtn label={`כן, אני ב-${sheet.room}`} onPress={() => changeRoom(sheet.room)} />
          <SheetBtn label="ביטול" onPress={() => setSheet(null)} color="rgba(255,255,255,0.08)" />
        </>
      );
    }

    if (sheet === 'friends') {
      return (
        <>
          <SheetTitle>חברים</SheetTitle>
          <SheetSub>רק חברים מאושרים רואים את המיקום שלך</SheetSub>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={addFriendPhone}
              onChangeText={setAddFriendPhone}
              placeholder="מספר טלפון של חבר"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              textAlign="right"
            />
            <TouchableOpacity style={styles.miniBtn} onPress={handleAddFriend}>
              <Text style={styles.miniBtnText}>הוסף</Text>
            </TouchableOpacity>
          </View>
          <View style={{ marginTop: 12, gap: 9 }}>
            {friends.length === 0
              ? <Text style={styles.emptyText}>אין חברים עדיין</Text>
              : friends.map(renderFriendRow)
            }
          </View>
        </>
      );
    }

    if (typeof sheet === 'object' && sheet.type === 'friend-actions') {
      const otherId = sheet.id;
      const f = friends.find((fr) => fr.uid === otherId);
      if (!f) return null;
      return (
        <>
          <View style={styles.friendHeader}>
            <View style={[styles.friendAvatar, { width: 46, height: 46, borderRadius: 23, backgroundColor: f.color }]}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>{f.name[0]}</Text>
            </View>
            <View>
              <SheetTitle>{f.name}</SheetTitle>
              <Text style={styles.cardSub}>{`נמצא/ת ב-${f.room}`}</Text>
            </View>
          </View>
          <SheetBtn label="💬 צ׳אט" onPress={() => setSheet({ type: 'chat', id: otherId })} />
          <SheetBtn label="📞 התקשר" onPress={() => setSheet({ type: 'call', id: otherId })} color={colors.green} />
          <SheetBtn
            label="😎 שלח סטיקר"
            onPress={() => { setStickerTarget(f); setSheet('stickers'); }}
            color={colors.primaryDark}
          />
        </>
      );
    }

    if (typeof sheet === 'object' && sheet.type === 'chat') {
      if (!fbUser) return null;
      const f = friends.find((fr) => fr.uid === sheet.id);
      return (
        <ChatView
          myUid={fbUser.uid}
          friendId={sheet.id}
          friendName={f?.name ?? 'חבר'}
          friendColor={f?.color ?? colors.green}
          onBack={() => setSheet({ type: 'friend-actions', id: sheet.id })}
        />
      );
    }

    if (typeof sheet === 'object' && sheet.type === 'call') {
      const f = friends.find((fr) => fr.uid === sheet.id);
      return (
        <View style={styles.callScreen}>
          <View style={[styles.callAvatar, { backgroundColor: f?.color ?? colors.green }]}>
            <Text style={styles.callAvatarLetter}>{(f?.name ?? '?')[0]}</Text>
          </View>
          <Text style={styles.callName}>{f?.name ?? 'חבר'}</Text>
          <Text style={styles.callStatus}>מתחבר...</Text>
          <TouchableOpacity style={styles.endCallBtn} onPress={() => setSheet(null)}>
            <Text style={{ fontSize: 24 }}>📵</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (sheet === 'teachers') {
      return (
        <>
          <SheetTitle>מורים במפה</SheetTitle>
          <SheetSub>דיווח מורה — הסרה רק אחרי הצבעה</SheetSub>
          <TextInput
            style={styles.input}
            value={teacherName}
            onChangeText={setTeacherName}
            placeholder="שם מורה"
            placeholderTextColor={colors.textFaint}
            textAlign="right"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
            {ALLOWED_TEACHER_ROOMS.map((r, i) => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, i === teacherRoomIdx && styles.chipSel]}
                onPress={() => setTeacherRoomIdx(i)}
              >
                <Text style={[styles.chipText, i === teacherRoomIdx && { color: '#fff' }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {['🙂','😐','😡','😍','😢'].map((e) => (
              <TouchableOpacity
                key={e}
                style={[styles.emojiBtn, reportEmojis.includes(e) && styles.emojiBtnSel]}
                onPress={() => setReportEmojis((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])}
              >
                <Text style={{ fontSize: 20 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <SheetBtn label="הוסף מורה" onPress={handleAddTeacher} />
          <View style={{ marginTop: 12, gap: 9 }}>
            {teachers.length === 0 && (
              <Text style={styles.emptyText}>אין מורים מדווחים כרגע</Text>
            )}
            {teachers.map((t) => {
              const myVote     = fbUser ? (t.votes ?? {})[fbUser.uid] : undefined;
              const hereVotes  = Object.values(t.votes ?? {}).filter((v) => v === 'here').length;
              const notHereVotes = Object.values(t.votes ?? {}).filter((v) => v === 'not_here').length;
              return (
                <View key={t.id} style={styles.card}>
                  <View style={{ marginBottom: 6 }}>
                    <Text style={styles.cardTitle}>{t.name}</Text>
                    <Text style={styles.cardSub}>{t.room}</Text>
                    {(hereVotes + notHereVotes) > 0 && (
                      <Text style={[styles.cardSub, { marginTop: 2 }]}>
                        ✅ עדיין כאן: {hereVotes}  ❌ כבר לא: {notHereVotes}
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      style={[styles.voteBtn, myVote === 'here' && styles.voteBtnHere]}
                      onPress={() => fbUser && voteOnTeacher(t.id, fbUser.uid, 'here')}
                    >
                      <Text style={styles.voteBtnText}>✅ עדיין כאן</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.voteBtn, myVote === 'cant_check' && styles.voteBtnCantCheck]}
                      onPress={() => fbUser && voteOnTeacher(t.id, fbUser.uid, 'cant_check')}
                    >
                      <Text style={styles.voteBtnText}>🤷 לא יכול לבדוק</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.voteBtn, myVote === 'not_here' && styles.voteBtnNotHere]}
                      onPress={() => fbUser && voteOnTeacher(t.id, fbUser.uid, 'not_here')}
                    >
                      <Text style={styles.voteBtnText}>❌ כבר לא כאן</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      );
    }

    if (sheet === 'bubble') {
      return (
        <>
          <SheetTitle>בועה מעלי</SheetTitle>
          <SheetSub>מה יופיע מעל הראש שלך במפה?</SheetSub>
          <TextInput
            style={styles.input}
            value={bubbleText}
            onChangeText={setBubbleText}
            placeholder="אני כאן..."
            placeholderTextColor={colors.textFaint}
            maxLength={40}
            textAlign="right"
            autoFocus
          />
          <SheetBtn
            label="שלח בועה"
            onPress={() => {
              if (bubbleText.trim()) showBubble(currentRoom, bubbleText.trim());
              setBubbleText('');
              setSheet(null);
            }}
          />
        </>
      );
    }

    if (sheet === 'stickers') {
      const targetName = stickerTarget?.name ?? '';

      function doSend(sticker: string) {
        if (!fbUser || !stickerTarget) return;
        // Never send a local device URI — receiver can't access another device's filesystem
        if (sticker.startsWith('file://') || sticker.startsWith('content://') || sticker.startsWith('blob:')) return;
        sendStickerRequest({ from: fbUser.uid, fromName: appUser?.name ?? '', to: stickerTarget.uid, toName: stickerTarget.name, sticker, sentAt: Date.now() });
        broadcastStickerBurst(sticker, currentRoom, stickerTarget.room);
      }

      return (
        <>
          <SheetTitle>😎 סטיקרים</SheetTitle>
          <SheetSub>
            {!stickerTarget && approvedFriends.length === 0
              ? 'אין חברים מאושרים עדיין'
              : !stickerTarget
                ? 'בחר חבר ואז לחץ על סטיקר'
                : `שולח ל-${targetName} — לחץ לשליחה, לחץ ארוך לרצף`}
          </SheetSub>

          {/* Friend avatar row — only when no preset target */}
          {!stickerTarget && approvedFriends.length > 0 && (
            <View style={styles.friendAvatarRow}>
              {approvedFriends.map((f) => (
                <TouchableOpacity
                  key={f.uid}
                  style={styles.friendAvatarPill}
                  onPress={() => setStickerTarget(f)}
                >
                  <View style={[styles.friendAvatar, { backgroundColor: f.color, width: 34, height: 34, borderRadius: 17 }]}>
                    <Text style={styles.friendAvatarLetter}>{f.name[0]}</Text>
                  </View>
                  <Text style={styles.friendAvatarName}>{f.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Sticker grid */}
          <View style={styles.stickerBank}>
            {stickers.map((s) => (
              <HoldSendBtn
                key={s}
                label={isImgSticker(s) ? '' : s}
                icon={isImgSticker(s) ? s : undefined}
                onSend={() => doSend(s)}
              />
            ))}
            <TouchableOpacity style={styles.stickerBtn} onPress={addImageSticker}>
              <Text style={{ fontSize: 22, color: colors.textMuted }}>📷</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    if (sheet === 'profile') {
      return (
        <>
          <SheetTitle>עריכת פרופיל</SheetTitle>
          <SheetSub>שנה שם ותמונת פרופיל</SheetSub>
          <View style={styles.profileEditRow}>
            <TouchableOpacity
              onPress={async () => {
                const r = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1,1], quality: 0.7 });
                if (!r.canceled) setProfileAvatarUri(r.assets[0].uri);
              }}
            >
              {profileAvatarUri || appUser?.avatarUrl ? (
                <Image source={{ uri: profileAvatarUri ?? appUser?.avatarUrl ?? '' }} style={styles.profileEditAvatar} />
              ) : (
                <View style={[styles.profileEditAvatar, { backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff' }}>{(appUser?.name ?? 'YO').slice(0, 2).toUpperCase()}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={profileName}
              onChangeText={setProfileName}
              placeholder="שם חדש"
              placeholderTextColor={colors.textFaint}
              maxLength={20}
              textAlign="right"
            />
          </View>
          <SheetBtn label="שמור פרופיל" onPress={handleProfileSave} />
          <SheetBtn label="התנתק" onPress={handleSignOut} color={colors.red} />
        </>
      );
    }

    return null;
  }

  const initials = (appUser?.name ?? 'YO').slice(0, 2).toUpperCase();
  const floorLabel = floor === 0 ? 'קומת קרקע' : `קומה ${floor}`;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>School Map</Text>
          <View style={styles.locBadge}>
            <View style={styles.locDot} />
            <Text style={styles.locText}>{`אתה ב-${currentRoom}`}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.profileBtn} onPress={() => setSheet('profile')} activeOpacity={0.8}>
          {appUser?.avatarUrl ? (
            <Image source={{ uri: appUser.avatarUrl }} style={styles.profileBtnImg} />
          ) : (
            <Text style={styles.profileBtnText}>{initials}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Map area */}
      <View style={styles.mapArea}>
        {/* Floor tabs */}
        <View style={styles.floorTabs}>
          {([0, 1, 2] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.floorTab, floor === f && styles.floorTabActive]}
              onPress={() => setFloor(f)}
            >
              <Text style={[styles.floorTabText, floor === f && styles.floorTabTextActive]}>
                {f === 0 ? 'קרקע' : `קומה ${f}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.floorBadge}>{floorLabel}</Text>

        {/* The map */}
        <ScrollView
          contentContainerStyle={styles.mapScroll}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        >
          <FloorMap
            floor={floor}
            currentRoom={currentRoom}
            userBubble={userBubble}
            friends={approvedFriends.map(f => ({
              id: f.uid, name: f.name, room: f.room,
              color: f.color, bubble: f.bubble,
            }))}
            teachers={teachers}
            stickerBursts={stickerBursts}
            onRoomPress={(r) => setSheet({ type: 'confirm-room', room: r })}
            onFriendPress={(id) => setSheet({ type: 'friend-actions', id })}
          />
        </ScrollView>

        {/* Bubble is now rendered inside FloorMap above the dot */}
      </View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {/* Online strip */}
        <View style={styles.onlineStrip}>
          {approvedFriends.slice(0, 4).map((f) => (
            <View key={f.uid} style={[styles.miniAv, { backgroundColor: f.color }]}>
              <Text style={styles.miniAvText}>{f.name[0]}</Text>
            </View>
          ))}
          <Text style={styles.onlineCount}>{approvedFriends.length} חברים קרובים</Text>
          <Text style={styles.livePill}>Live</Text>
        </View>

        <View style={styles.toolRow}>
          <TouchableOpacity style={[styles.toolBtn, styles.toolBtnPrimary]} onPress={() => setSheet('room-picker')}>
            <Text style={styles.toolBtnText}>📍 אני כאן</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => setSheet('friends')}>
            <Text style={styles.toolBtnText}>👥 חברים</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => setSheet('bubble')}>
            <Text style={styles.toolBtnText}>💬 בועה</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => setSheet('teachers')}>
            <Text style={styles.toolBtnText}>🏫 מורים</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Incoming sticker overlays */}
      {stickerOverlays.map((o) => (
        <StickerOverlayItem
          key={o.id}
          sticker={o.sticker}
          fromName={o.fromName}
          onDone={() => setStickerOverlays((prev) => prev.filter((x) => x.id !== o.id))}
        />
      ))}

      {/* Sheet */}
      <Sheet visible={sheet !== null} onClose={() => { setSheet(null); setStickerTarget(null); setSelectedStickerForPicker(''); }}>
        {renderSheetContent()}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 64, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  appTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  locBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#42dc8c', shadowColor: '#42dc8c', shadowOpacity: 0.7, shadowRadius: 4 },
  locText: { fontSize: 11, color: colors.accent },
  profileBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.primaryDark,
    borderWidth: 2, borderColor: 'rgba(132,190,255,0.45)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  profileBtnImg: { width: 42, height: 42 },
  profileBtnText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  mapArea: {
    flex: 1,
    backgroundColor: colors.mapBg,
    position: 'relative',
    overflow: 'hidden',
  },
  mapScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 54 },
  floorTabs: {
    position: 'absolute', top: 10, left: 10, right: 10,
    flexDirection: 'row', justifyContent: 'center',
    backgroundColor: 'rgba(4,10,20,0.58)',
    borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 30,
  },
  floorTab: { flex: 1, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  floorTabActive: { backgroundColor: colors.primary },
  floorTabText: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.55)' },
  floorTabTextActive: { color: '#fff' },
  floorBadge: {
    position: 'absolute', top: 12, left: 12, zIndex: 29,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 10, fontWeight: '850', color: '#2d3a2e',
  } as any,
  bubble: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    zIndex: 40,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 8,
  },
  bubbleText: { fontSize: 11, fontWeight: '900', color: '#102033' },
  bottomBar: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    padding: 14,
  },
  onlineStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  miniAv: {
    width: 23, height: 23, borderRadius: 12,
    borderWidth: 2, borderColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: -7,
  },
  miniAvText: { fontSize: 8, fontWeight: '900', color: '#fff' },
  onlineCount: { fontSize: 11, color: colors.textMuted, marginLeft: 4 },
  livePill: { marginLeft: 'auto' as any, fontSize: 10, color: 'rgba(255,255,255,0.45)' },
  toolRow: { flexDirection: 'row', gap: 8 },
  toolBtn: {
    flex: 1, height: 42, backgroundColor: '#194982',
    borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center',
  },
  toolBtnPrimary: { backgroundColor: colors.primary },
  toolBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  // Sheet internals
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8, padding: 10,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 13, fontWeight: '900', color: colors.text },
  cardSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  pill: {
    backgroundColor: colors.primary,
    borderRadius: 999, paddingVertical: 7, paddingHorizontal: 9,
  },
  pillText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  friendAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  friendAvatarLetter: { fontSize: 15, fontWeight: '900', color: '#fff' },
  friendHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border,
    color: colors.text, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
  },
  miniBtn: {
    backgroundColor: colors.primary, borderRadius: radii.lg,
    paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', minWidth: 60,
  },
  miniBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 12 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  roomBtn: {
    minHeight: 39, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 10, paddingVertical: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  roomBtnSel: { backgroundColor: colors.primary },
  roomBtnText: { fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.82)' },
  chip: {
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, marginRight: 6,
  },
  chipSel: { backgroundColor: '#1d5fbd', borderColor: colors.accent },
  chipText: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  emojiBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 2, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  emojiBtnSel: { backgroundColor: 'rgba(36,118,232,0.28)', borderColor: colors.primary },
  voteBtn: {
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
  },
  voteBtnHere:      { backgroundColor: 'rgba(22,163,74,0.3)',  borderColor: '#16a34a' },
  voteBtnCantCheck: { backgroundColor: 'rgba(146,64,14,0.3)',  borderColor: '#92400e' },
  voteBtnNotHere:   { backgroundColor: 'rgba(220,38,38,0.3)',  borderColor: colors.red },
  voteBtnText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  stickerBank: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  stickerBtn: {
    width: 50, height: 50, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
  },
  stickerBtnSel: {
    backgroundColor: 'rgba(36,118,232,0.35)',
    borderWidth: 2, borderColor: colors.primary,
  },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14, justifyContent: 'center' },
  friendAvatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  friendAvatarPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 999, paddingRight: 10, paddingVertical: 3,
    borderWidth: 2, borderColor: 'transparent',
  },
  friendAvatarName: { fontSize: 12, fontWeight: '800', color: colors.text },
  profileEditRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  profileEditAvatar: { width: 64, height: 64, borderRadius: 32 },
  callScreen: { alignItems: 'center', gap: 18, paddingVertical: 24 },
  callAvatar: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)',
  },
  callAvatarLetter: { fontSize: 30, fontWeight: '900', color: '#fff' },
  callName: { fontSize: 22, fontWeight: '900', color: colors.text },
  callStatus: { fontSize: 13, color: colors.textMuted },
  endCallBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.red,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 10,
  },
});
