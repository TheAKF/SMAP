// Native background-fetch implementation.
// Runs every ~5 minutes even when the app is closed.
// On iOS, Apple controls exact timing (usually 15-30 min); on Android it's reliable.
//
// This task replaces the Cloud Function so no Firebase billing is required.
// It handles two notification types:
//   1. Teacher in your exact room  → notify you every cycle
//   2. Teacher 5+ min old on your floor → notify everyone on the floor (once per teacher)

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { getAuth } from 'firebase/auth';
import {
  doc, getDoc, getDocs, updateDoc,
  collection, query, where,
} from 'firebase/firestore';
import { db } from './firebase';

const TASK = 'TEACHER_POLL_TASK';

// Rooms per floor — keep in sync with constants/rooms.ts
const FLOOR_ROOMS: Record<number, string[]> = {
  0: ['מסדרון קומת קרקע', 'חדר מורים', 'מזכירות', 'ארט טק', 'התכנסות',
      'שירותי בנים קרקע', 'שירותי בנות קרקע', 'מקלט מוזיקה', 'מקלט רובוטיקה', 'החדר של אנה'],
  1: ['מסדרון קומה ראשונה', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9',
      'מעבדת פיזיקה', 'מעבדת פודטק', 'שירותי בנים קומה ראשונה', 'שירותי בנות קומה ראשונה'],
  2: ['מסדרון קומה שניה', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9',
      'ניהול עצמי', 'שירותי בנים קומה שניה', 'שירותי בנות קומה שניה'],
};

function getFloorRooms(room: string): string[] {
  for (const rooms of Object.values(FLOOR_ROOMS)) {
    if (rooms.includes(room)) return rooms;
  }
  return [];
}

// ─── Task definition ─────────────────────────────────────────────────────────
TaskManager.defineTask(TASK, async () => {
  try {
    const user = getAuth().currentUser;
    if (!user) return BackgroundFetch.BackgroundFetchResult.NoData;

    // Get the current user's room
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if (!userSnap.exists()) return BackgroundFetch.BackgroundFetchResult.NoData;
    const currentRoom: string = userSnap.data().currentRoom;

    const now    = Date.now();
    const cutoff = now - 30 * 60 * 1000; // 30-min stale window
    const fiveMin = now - 5 * 60 * 1000;

    // Fetch all active (non-removed) teachers reported in the last 30 min
    const teachersSnap = await getDocs(
      query(
        collection(db, 'teachers'),
        where('lastPoll', '>=', cutoff)
      )
    );

    if (teachersSnap.empty) return BackgroundFetch.BackgroundFetchResult.NoData;

    let fired = false;
    const myFloorRooms = getFloorRooms(currentRoom);

    for (const teacherDoc of teachersSnap.docs) {
      const t = teacherDoc.data() as {
        name: string; room: string; lastPoll: number;
        reportedAt?: number; status?: string; floorNotifSent?: boolean;
      };

      if (t.status === 'removed') continue;

      const reportedAt = t.reportedAt ?? t.lastPoll;
      const onMyFloor  = myFloorRooms.includes(t.room);
      const inMyRoom   = t.room === currentRoom;

      // ── 1. Teacher in my exact room — notify every cycle ──────────────────
      if (inMyRoom) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🏫 מורה בכיתה שלך',
            body: `${t.name} ב-${t.room} — עדיין שם?`,
            data: { type: 'teacher_poll', teacherId: teacherDoc.id, room: t.room },
            sound: 'default',
          },
          trigger: null,
        });
        fired = true;
      }

      // ── 2. Teacher 5+ min old on my floor — notify once (floor-wide) ──────
      // We use floorNotifSent as a Firestore flag so only one device marks it,
      // but every device on the floor shows the local notification independently.
      if (onMyFloor && !inMyRoom && reportedAt <= fiveMin && !t.floorNotifSent) {
        // Optimistically mark as sent to prevent other devices doing it too.
        // Race condition is harmless — worst case two devices mark it simultaneously.
        try {
          await updateDoc(doc(db, 'teachers', teacherDoc.id), { floorNotifSent: true });
        } catch (_) { /* another device beat us — that's fine */ }

        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🏫 מורה בקומה שלך',
            body: `${t.name} ב-${t.room} — עדיין שם? הצבע עכשיו`,
            data: { type: 'teacher_poll', teacherId: teacherDoc.id, room: t.room },
            sound: 'default',
          },
          trigger: null,
        });
        fired = true;
      }
    }

    return fired
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (_) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── Registration helpers ─────────────────────────────────────────────────────

export async function registerTeacherPollTask(_uid: string): Promise<void> {
  try {
    const already = await TaskManager.isTaskRegisteredAsync(TASK);
    if (already) return;

    await BackgroundFetch.registerTaskAsync(TASK, {
      minimumInterval: 5 * 60,  // 5 minutes (iOS may honour longer intervals)
      stopOnTerminate: false,    // Android: keep running after app is closed
      startOnBoot: true,         // Android: restart after device reboot
    });
  } catch (_) {}
}

export async function unregisterTeacherPollTask(): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(TASK);
    if (registered) await BackgroundFetch.unregisterTaskAsync(TASK);
  } catch (_) {}
}
