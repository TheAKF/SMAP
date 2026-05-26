import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, onSnapshot, addDoc,
  orderBy, limit, getDocs,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { User, Friendship, Teacher, Message, StickerRequest } from '../types';

const FRIEND_COLORS = [
  '#11b981', '#06b6d4', '#a78bfa', '#f59e0b',
  '#ec4899', '#3b82f6', '#10b981', '#6366f1',
];

// ─── Users ───────────────────────────────────────────────────────────────────

export async function createUser(uid: string, data: Omit<User, 'uid'>): Promise<void> {
  await setDoc(doc(db, 'users', uid), { ...data, uid });
}

export async function getUser(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as User) : null;
}

export async function updateUserRoom(uid: string, room: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { currentRoom: room });
}

export async function setUserBubble(uid: string, text: string | null): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    bubble: text,
    bubbleExpiry: text ? Date.now() + 5 * 60 * 1000 : null,
  });
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<User, 'name' | 'avatarUrl'>>
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), data);
}

export async function saveCustomStickers(uid: string, stickers: string[]): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { customStickers: stickers });
}

export async function savePushToken(uid: string, token: string | null): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { pushToken: token });
}

// ─── Friendships ─────────────────────────────────────────────────────────────

function friendshipId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

export async function sendFriendRequest(
  myUid: string,
  theirPhone: string
): Promise<'sent' | 'not_found'> {
  // Look up user by phone
  const q = query(collection(db, 'users'), where('phone', '==', theirPhone));
  const snap = await getDocs(q);
  if (snap.empty) return 'not_found';
  const theirUid = snap.docs[0].id;
  const id = friendshipId(myUid, theirUid);
  await setDoc(doc(db, 'friendships', id), {
    id,
    users: [myUid, theirUid].sort(),
    status: 'pending',
    requestedBy: myUid,
    createdAt: Date.now(),
  });
  return 'sent';
}

export async function approveFriendship(friendshipId: string): Promise<void> {
  await updateDoc(doc(db, 'friendships', friendshipId), { status: 'approved' });
}

export function listenFriendships(
  uid: string,
  cb: (friendships: Friendship[]) => void
): Unsubscribe {
  const q = query(collection(db, 'friendships'), where('users', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.data() as Friendship));
  });
}

// ─── Teachers ────────────────────────────────────────────────────────────────

export async function addTeacher(teacher: Omit<Teacher, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'teachers'), {
    ...teacher,
    reportedAt: teacher.reportedAt ?? Date.now(),
    status: 'active',
    votes: {},
    floorNotifSent: false,
  });
  await updateDoc(ref, { id: ref.id });
  return ref.id;
}

export async function voteOnTeacher(
  teacherId: string,
  userId: string,
  vote: 'here' | 'cant_check' | 'not_here'
): Promise<void> {
  const ref = doc(db, 'teachers', teacherId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const teacher = snap.data() as Teacher;
  const votes = { ...(teacher.votes ?? {}), [userId]: vote };
  const hereCount    = Object.values(votes).filter((v) => v === 'here').length;
  const notHereCount = Object.values(votes).filter((v) => v === 'not_here').length;
  // Remove if "not here" beats "here" and at least 2 people voted either way
  const total = hereCount + notHereCount;
  const shouldRemove = total >= 2 && notHereCount > hereCount;
  await updateDoc(ref, {
    votes,
    lastPoll: Date.now(),
    ...(shouldRemove ? { status: 'removed' } : {}),
  });
}

export async function removeTeacher(id: string): Promise<void> {
  await deleteDoc(doc(db, 'teachers', id));
}

export async function confirmTeacher(id: string): Promise<void> {
  await updateDoc(doc(db, 'teachers', id), { confirmed: true, lastPoll: Date.now() });
}

export function listenTeachers(cb: (teachers: Teacher[]) => void): Unsubscribe {
  const cutoff = Date.now() - 30 * 60 * 1000;
  const q = query(collection(db, 'teachers'), where('lastPoll', '>=', cutoff));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Teacher)
        .filter((t) => t.status !== 'removed')
    );
  });
}

export interface FriendLive {
  uid: string;
  friendshipId: string;
  status: 'pending' | 'approved';
  requestedBy: string;
  name: string;
  room: string;
  color: string;
  avatarUrl: string | null;
  bubble?: string | null;
  bubbleExpiry?: number | null;
}

export function listenFriendsLive(
  uid: string,
  cb: (friends: FriendLive[]) => void
): Unsubscribe {
  let userUnsubscribers: Unsubscribe[] = [];
  let currentFriendships: Friendship[] = [];
  let friendUserData: Record<string, User> = {};

  function emit() {
    const result: FriendLive[] = currentFriendships.map((f, i) => {
      const friendUid = f.users.find((u) => u !== uid) ?? '';
      const userData = friendUserData[friendUid];
      return {
        uid: friendUid,
        friendshipId: f.id,
        status: f.status,
        requestedBy: f.requestedBy,
        name: userData?.name ?? 'חבר',
        room: userData?.currentRoom ?? 'A1',
        color: FRIEND_COLORS[i % FRIEND_COLORS.length],
        avatarUrl: userData?.avatarUrl ?? null,
        bubble: userData?.bubble ?? null,
        bubbleExpiry: userData?.bubbleExpiry ?? null,
      };
    });
    cb(result);
  }

  function subscribeToUsers(friendships: Friendship[]) {
    userUnsubscribers.forEach((u) => u());
    userUnsubscribers = [];
    friendUserData = {};

    friendships.forEach((f) => {
      const friendUid = f.users.find((u) => u !== uid);
      if (!friendUid) return;
      const unsub = onSnapshot(doc(db, 'users', friendUid), (snap) => {
        if (snap.exists()) {
          const u = snap.data() as User;
          // Clear expired bubbles
          if (u.bubbleExpiry && u.bubbleExpiry < Date.now()) {
            u.bubble = null;
          }
          friendUserData[friendUid] = u;
        }
        emit();
      });
      userUnsubscribers.push(unsub);
    });
  }

  const unsubFriendships = listenFriendships(uid, (friendships) => {
    currentFriendships = friendships;
    subscribeToUsers(friendships);
    emit();
  });

  return () => {
    unsubFriendships();
    userUnsubscribers.forEach((u) => u());
  };
}

// ─── Messages ────────────────────────────────────────────────────────────────

function conversationId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

export async function sendMessage(
  myUid: string,
  theirUid: string,
  text: string
): Promise<void> {
  const convId = conversationId(myUid, theirUid);
  await addDoc(collection(db, 'messages', convId, 'msgs'), {
    from: myUid,
    text,
    sentAt: Date.now(),
  });
}

export function listenMessages(
  myUid: string,
  theirUid: string,
  cb: (msgs: Message[]) => void
): Unsubscribe {
  const convId = conversationId(myUid, theirUid);
  const q = query(
    collection(db, 'messages', convId, 'msgs'),
    orderBy('sentAt', 'asc'),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message));
  });
}

// ─── Stickers ────────────────────────────────────────────────────────────────

export async function sendStickerRequest(
  req: Omit<StickerRequest, 'id'>
): Promise<void> {
  await addDoc(collection(db, 'stickerRequests'), req);
}

export interface StickerBurst {
  id: string;
  sticker: string;
  fromRoom: string;
  toRoom: string;
  sentAt: number;
}

export async function broadcastStickerBurst(
  sticker: string, fromRoom: string, toRoom: string
): Promise<void> {
  await addDoc(collection(db, 'stickerBursts'), {
    sticker, fromRoom, toRoom, sentAt: Date.now(),
  });
}

export function listenStickerBursts(
  cb: (bursts: StickerBurst[]) => void
): Unsubscribe {
  const cutoff = Date.now() - 5000; // last 5 seconds
  const q = query(
    collection(db, 'stickerBursts'),
    where('sentAt', '>=', cutoff),
    orderBy('sentAt', 'desc'),
    limit(20)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StickerBurst));
  });
}

export function listenStickerRequests(
  uid: string,
  cb: (reqs: StickerRequest[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'stickerRequests'),
    where('to', '==', uid),
    limit(20)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StickerRequest));
  });
}
