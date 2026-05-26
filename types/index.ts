export interface User {
  uid: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  currentRoom: string;
  isAdmin: boolean;
  createdAt: number;
  bubble?: string | null;
  bubbleExpiry?: number | null;
  customStickers?: string[];
  pushToken?: string | null;
}

export interface Friendship {
  id: string;
  users: [string, string];
  status: 'pending' | 'approved';
  requestedBy: string;
  friendName?: string;
  friendAvatarUrl?: string | null;
  friendRoom?: string;
  friendColor?: string;
}

export interface Teacher {
  id: string;
  name: string;
  room: string;
  reportedBy: string;
  reportedAt?: number;
  lastPoll: number;
  confirmed: boolean;
  emojis?: string[];
  votes?: Record<string, 'here' | 'cant_check' | 'not_here'>;
  status?: 'active' | 'removed';
  floorNotifSent?: boolean;
}

export interface Message {
  id: string;
  from: string;
  text: string;
  sentAt: number;
}

export interface StickerRequest {
  id: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  sticker: string;
  sentAt: number;
}

export interface RoomCoord {
  x: number;
  y: number;
  ly: number;
  f: 0 | 1 | 2;
}

export interface RoomBox {
  left: number;
  top: number;
  width: number;
  height: number;
}
