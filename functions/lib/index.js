"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollTeachers = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
// Rooms per floor — kept in sync with constants/rooms.ts
const FLOOR_ROOMS = {
    0: ['מסדרון קומת קרקע', 'חדר מורים', 'מזכירות', 'ארט טק', 'התכנסות',
        'שירותי בנים קרקע', 'שירותי בנות קרקע', 'מקלט מוזיקה', 'מקלט רובוטיקה', 'החדר של אנה'],
    1: ['מסדרון קומה ראשונה', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9',
        'מעבדת פיזיקה', 'מעבדת פודטק', 'שירותי בנים קומה ראשונה', 'שירותי בנות קומה ראשונה'],
    2: ['מסדרון קומה שניה', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9',
        'ניהול עצמי', 'שירותי בנים קומה שניה', 'שירותי בנות קומה שניה'],
};
function getFloorRooms(room) {
    for (const rooms of Object.values(FLOOR_ROOMS)) {
        if (rooms.includes(room))
            return rooms;
    }
    return [];
}
async function sendPushChunks(messages) {
    for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chunk),
        });
    }
}
// Runs every 5 minutes.
// 1) After a teacher has been reported for 5+ minutes, notifies everyone on that FLOOR.
// 2) Regular per-room poll for users in the same room as an active teacher.
exports.pollTeachers = (0, scheduler_1.onSchedule)('every 5 minutes', async () => {
    var _a;
    const now = Date.now();
    const cutoff = now - 30 * 60 * 1000; // 30-min stale window
    const fiveMin = now - 5 * 60 * 1000;
    const teachersSnap = await db.collection('teachers')
        .where('lastPoll', '>=', cutoff)
        .get();
    if (teachersSnap.empty)
        return;
    const messages = [];
    for (const teacherDoc of teachersSnap.docs) {
        const teacher = teacherDoc.data();
        if (teacher.status === 'removed')
            continue;
        const reportedAt = (_a = teacher.reportedAt) !== null && _a !== void 0 ? _a : teacher.lastPoll;
        // ── Floor-wide notification once at the 5-minute mark ──────────────────
        if (reportedAt <= fiveMin && !teacher.floorNotifSent) {
            const floorRooms = getFloorRooms(teacher.room);
            if (floorRooms.length > 0) {
                // Firestore 'in' supports up to 30 values; each floor has ≤14 rooms
                const usersSnap = await db.collection('users')
                    .where('currentRoom', 'in', floorRooms)
                    .get();
                for (const userDoc of usersSnap.docs) {
                    const user = userDoc.data();
                    if (!user.pushToken || !user.pushToken.startsWith('ExponentPushToken'))
                        continue;
                    messages.push({
                        to: user.pushToken,
                        sound: 'default',
                        title: '🏫 מורה בקומה שלך',
                        body: `${teacher.name} ב-${teacher.room} — עדיין שם? הצבע עכשיו`,
                        data: { type: 'teacher_poll', teacherId: teacherDoc.id, room: teacher.room },
                        priority: 'high',
                    });
                }
                await teacherDoc.ref.update({ floorNotifSent: true });
            }
        }
        // ── Ongoing per-room poll for users inside the teacher's room ───────────
        const usersInRoomSnap = await db.collection('users')
            .where('currentRoom', '==', teacher.room)
            .get();
        for (const userDoc of usersInRoomSnap.docs) {
            const user = userDoc.data();
            if (!user.pushToken || !user.pushToken.startsWith('ExponentPushToken'))
                continue;
            messages.push({
                to: user.pushToken,
                sound: 'default',
                title: '🏫 מורה בכיתה שלך',
                body: `${teacher.name} ב-${teacher.room} — עדיין שם?`,
                data: { type: 'teacher_poll', teacherId: teacherDoc.id, room: teacher.room },
                priority: 'high',
            });
        }
    }
    if (messages.length === 0)
        return;
    await sendPushChunks(messages);
});
//# sourceMappingURL=index.js.map