import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Image,
} from 'react-native';
import { ROOM_BOXES, ROOM_COORDS, FLOOR_ROOMS } from '../constants/rooms';
import { Teacher } from '../types';
import { StickerBurst } from '../services/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Friend {
  id: string;
  name: string;
  room: string;
  color: string;
  bubble?: string | null;
}

interface UserBubble {
  room: string;
  text: string;
}

interface Props {
  floor: 0 | 1 | 2;
  currentRoom: string;
  userBubble?: UserBubble | null;
  friends: Friend[];
  teachers: Teacher[];
  stickerBursts?: StickerBurst[];
  onRoomPress: (room: string) => void;
  onFriendPress?: (friendId: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAP_W = 322;
const MAP_H = 382;
const DOT = 20;

// ─── Room classification ──────────────────────────────────────────────────────

type RoomKind = 'classroom' | 'lab' | 'admin' | 'corridor' | 'toilet' | 'special';

function kindOf(room: string): RoomKind {
  if (room.includes('מסדרון')) return 'corridor';
  if (room.includes('שירותי')) return 'toilet';
  if (room.includes('מעבדת')) return 'lab';
  if (room === 'ניהול עצמי' || room === 'מזכירות') return 'admin';
  if (room === 'חדר מורים' || room === 'ארט טק' || room === 'התכנסות') return 'special';
  return 'classroom';
}

const KIND_STYLE: Record<RoomKind, {
  bg: string; border: string; text: string;
  activeBg: string; activeBorder: string; activeText: string;
}> = {
  classroom: {
    bg: 'rgba(12, 36, 74, 0.92)',
    border: 'rgba(56, 114, 210, 0.38)',
    text: 'rgba(160, 200, 255, 0.88)',
    activeBg: '#1a52d0',
    activeBorder: '#7ab8ff',
    activeText: '#ffffff',
  },
  lab: {
    bg: 'rgba(4, 50, 42, 0.92)',
    border: 'rgba(14, 170, 120, 0.42)',
    text: 'rgba(90, 210, 170, 0.92)',
    activeBg: '#065f46',
    activeBorder: '#34d399',
    activeText: '#ffffff',
  },
  admin: {
    bg: 'rgba(36, 8, 68, 0.92)',
    border: 'rgba(120, 70, 230, 0.48)',
    text: 'rgba(185, 148, 255, 0.92)',
    activeBg: '#5b21b6',
    activeBorder: '#c4b5fd',
    activeText: '#ffffff',
  },
  corridor: {
    bg: 'rgba(160, 180, 210, 0.05)',
    border: 'rgba(160, 180, 210, 0.12)',
    text: 'rgba(140, 165, 200, 0.5)',
    activeBg: 'rgba(59, 130, 246, 0.22)',
    activeBorder: '#60a5fa',
    activeText: '#93c5fd',
  },
  toilet: {
    bg: 'rgba(16, 22, 38, 0.94)',
    border: 'rgba(55, 68, 100, 0.55)',
    text: 'rgba(65, 82, 125, 0.9)',
    activeBg: '#1e3a5f',
    activeBorder: '#60a5fa',
    activeText: '#bfdbfe',
  },
  special: {
    bg: 'rgba(62, 28, 4, 0.92)',
    border: 'rgba(230, 140, 20, 0.42)',
    text: 'rgba(248, 185, 90, 0.92)',
    activeBg: '#92400e',
    activeBorder: '#fcd34d',
    activeText: '#ffffff',
  },
};

const ROOM_ICONS: Partial<Record<string, string>> = {
  'מעבדת פיזיקה': '⚗️',
  'מעבדת פודטק': '🍕',
  'חדר מורים': '👩‍🏫',
  'מזכירות': '📋',
  'ניהול עצמי': '🎓',
  'ארט טק': '🎨',
  'התכנסות': '🪑',
  'מקלט מוזיקה': '🎵',
  'מקלט רובוטיקה': '🤖',
  'החדר של אנה': '🌟',
  'שירותי בנים קרקע': '🚹',
  'שירותי בנות קרקע': '🚺',
  'שירותי בנים קומה ראשונה': '🚹',
  'שירותי בנות קומה ראשונה': '🚺',
  'שירותי בנים קומה שניה': '🚹',
  'שירותי בנות קומה שניה': '🚺',
};

// ─── Animated pulse ring on the active room ───────────────────────────────────

function PulseRing() {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.08, duration: 950, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1,    duration: 950, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.1,  duration: 950, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5,  duration: 950, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: 9,
          borderWidth: 2,
          borderColor: '#7ab8ff',
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

// ─── Sticker burst animation ──────────────────────────────────────────────────

function StickerBurstAnim({ sticker }: { sticker: string }) {
  const scale      = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.7, useNativeDriver: true, damping: 5 }),
      Animated.spring(scale, { toValue: 1.0, useNativeDriver: true }),
      Animated.delay(1000),
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 0,   duration: 550, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -52, duration: 550, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const isImg = sticker.startsWith('http') || sticker.startsWith('blob:');
  return (
    <Animated.View style={{ transform: [{ scale }, { translateY }], opacity, alignItems: 'center' }}>
      {isImg
        ? <Image source={{ uri: sticker }} style={{ width: 44, height: 44, borderRadius: 10 }} />
        : <Text style={{ fontSize: 34, textAlign: 'center' }}>{sticker}</Text>}
    </Animated.View>
  );
}

// ─── Stable position inside a room box ───────────────────────────────────────
// Deterministic hash of a string → two fractions in [0,1)
function stablePos(
  seed: string,
  box: { left: number; top: number; width: number; height: number }
): { cx: number; cy: number } {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h * 33) ^ seed.charCodeAt(i)) >>> 0;
  }
  const pad = 10; // px of padding from box edges so dot fits fully
  const safeW = Math.max(1, box.width  - pad * 2);
  const safeH = Math.max(1, box.height - pad * 2);
  const fx = (h % 1000) / 1000;
  const fy = ((h >>> 10) % 1000) / 1000;
  return {
    cx: box.left + pad + fx * safeW,
    cy: box.top  + pad + fy * safeH,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FloorMap({
  floor, currentRoom, userBubble, friends, teachers,
  stickerBursts = [], onRoomPress, onFriendPress,
}: Props) {
  const floorRooms  = FLOOR_ROOMS[floor] ?? [];
  const userCoord   = ROOM_COORDS[currentRoom];
  const userOnFloor = userCoord && userCoord.f === floor;

  const floorstickerBursts = stickerBursts.filter((b) => {
    const c = ROOM_COORDS[b.toRoom];
    return c && c.f === floor;
  });

  function buildRoomStyle(room: string) {
    const kind = kindOf(room);
    const k    = KIND_STYLE[kind];
    const box  = ROOM_BOXES[room];
    if (!box) return null;
    const isActive   = room === currentRoom;
    const isCorridor = kind === 'corridor';
    return {
      position: 'absolute' as const,
      left: box.left, top: box.top, width: box.width, height: box.height,
      backgroundColor: isActive ? k.activeBg : k.bg,
      borderRadius: isCorridor ? 999 : 9,
      borderWidth: isActive ? 1.5 : 1,
      borderColor: isActive ? k.activeBorder : k.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
      zIndex: isCorridor ? 1 : 2,
    };
  }

  return (
    <View style={[styles.map, { width: MAP_W, height: MAP_H }]}>

      {/* Dark floor background */}
      <View style={styles.floorBg} />

      {/* Subtle vertical centre line flanking the corridor */}
      <View style={[styles.gridLine, { left: 147, top: 4, width: 1, bottom: 4, height: undefined }]} />
      <View style={[styles.gridLine, { left: 174, top: 4, width: 1, bottom: 4, height: undefined }]} />

      {/* Rooms */}
      {floorRooms.map((room) => {
        const s = buildRoomStyle(room);
        if (!s) return null;
        const k          = KIND_STYLE[kindOf(room)];
        const isActive   = room === currentRoom;
        const isCorridor = kindOf(room) === 'corridor';
        const isToilet   = kindOf(room) === 'toilet';
        const icon       = ROOM_ICONS[room];

        return (
          <TouchableOpacity key={room} style={s} onPress={() => onRoomPress(room)} activeOpacity={0.72}>

            {/* Animated border when active */}
            {isActive && <PulseRing />}

            {/* Dashed centre-line inside corridor */}
            {isCorridor && !isActive && (
              <View style={styles.corridorDashes} pointerEvents="none">
                {Array.from({ length: 7 }).map((_, i) => (
                  <View key={i} style={styles.corridorDash} />
                ))}
              </View>
            )}

            {/* Room label (icon + name) */}
            <Text
              style={[
                styles.roomLabel,
                { color: isActive ? k.activeText : k.text },
                isCorridor && styles.roomLabelCorridor,
              ]}
              numberOfLines={isToilet || isCorridor ? 1 : 2}
            >
              {icon ? `${icon} ` : ''}{room}
            </Text>
          </TouchableOpacity>
        );
      })}

      {/* Teacher indicators */}
      {teachers.map((t) => {
        const c = ROOM_COORDS[t.room];
        if (!c || c.f !== floor) return null;
        return (
          <View key={t.id} style={[styles.dotWrapper, { left: c.x + 6, top: c.y - 30, zIndex: 25 }]}>
            <View style={styles.teacherPill}>
              <View style={styles.teacherBullet} />
              <Text style={styles.teacherPillText} numberOfLines={1}>{t.name}</Text>
            </View>
          </View>
        );
      })}

      {/* Friend dots — positioned inside their room box */}
      {friends.map((f) => {
        const coord = ROOM_COORDS[f.room];
        if (!coord || coord.f !== floor) return null;
        const box = ROOM_BOXES[f.room];
        if (!box) return null;
        const { cx, cy } = stablePos(f.id, box);
        const bubble = f.bubble?.trim();
        // dotWrapper: namePill (≈16px) + gap(2) + dot(20). dot center = top + 28.
        return (
          <TouchableOpacity
            key={f.id}
            style={[styles.dotWrapper, { left: cx - 30, top: cy - 28, zIndex: 22 }]}
            onPress={() => onFriendPress?.(f.id)}
            activeOpacity={0.8}
          >
            {bubble ? (
              <View style={[styles.bubblePill, { borderColor: f.color }]}>
                <Text style={styles.bubblePillText}>{bubble}</Text>
              </View>
            ) : null}
            <View style={[styles.namePill, { backgroundColor: f.color + 'bb' }]}>
              <Text style={styles.namePillText}>{f.name}</Text>
            </View>
            <View style={[styles.dot, { backgroundColor: f.color, shadowColor: f.color }]} />
          </TouchableOpacity>
        );
      })}

      {/* User dot — centered inside current room box */}
      {userOnFloor && userCoord ? (() => {
        const box = ROOM_BOXES[currentRoom];
        const cx = box ? box.left + box.width  / 2 : userCoord.x;
        const cy = box ? box.top  + box.height / 2 : userCoord.y;
        return (
          <View style={[styles.dotWrapper, { left: cx - 30, top: cy - 30, zIndex: 23 }]}>
            {userBubble?.room === currentRoom ? (
              <View style={[styles.bubblePill, { borderColor: '#60a5fa' }]}>
                <Text style={styles.bubblePillText}>{userBubble.text}</Text>
              </View>
            ) : null}
            <View style={styles.namePillUser}>
              <Text style={styles.namePillText}>אתה</Text>
            </View>
            <View style={styles.userDot}>
              <View style={styles.userDotCore} />
            </View>
          </View>
        );
      })() : null}

      {/* Sticker burst animations */}
      {floorstickerBursts.map((b, idx) => {
        const c = ROOM_COORDS[b.toRoom];
        if (!c) return null;
        const sx = (idx % 5 - 2) * 14;
        const sy = (idx % 3) * -8;
        return (
          <View
            key={b.id}
            style={{ position: 'absolute', left: c.x - 22 + sx, top: c.y - 62 + sy, zIndex: 50, alignItems: 'center' }}
            pointerEvents="none"
          >
            <StickerBurstAnim sticker={b.sticker} />
          </View>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  map: {
    position: 'relative',
    alignSelf: 'center',
  },

  floorBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#080f1e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(40, 80, 160, 0.2)',
    shadowColor: '#1a52d0',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(48, 80, 140, 0.1)',
    zIndex: 0,
  },

  corridorDashes: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 14,
  },
  corridorDash: {
    width: 16,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(140, 165, 200, 0.16)',
  },

  roomLabel: {
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 11,
    letterSpacing: 0.15,
  },
  roomLabelCorridor: {
    fontSize: 7.5,
    letterSpacing: 1.4,
    fontWeight: '700',
  },

  dotWrapper: { position: 'absolute', alignItems: 'center', gap: 2 },

  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowOpacity: 0.7,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },

  userDot: {
    width: DOT + 4,
    height: DOT + 4,
    borderRadius: (DOT + 4) / 2,
    backgroundColor: '#1a52d0',
    borderWidth: 2.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#60a5fa',
    shadowOpacity: 0.9,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
  },
  userDotCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#fff',
  },

  namePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
  },
  namePillUser: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: 'rgba(26, 82, 208, 0.78)',
  },
  namePillText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.1,
  },

  bubblePill: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1.5,
    maxWidth: 115,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  bubblePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0f1e38',
    textAlign: 'center',
  },

  teacherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(120, 50, 5, 0.9)',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    maxWidth: 90,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  teacherBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fbbf24',
  },
  teacherPillText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#fde68a',
  },
});
