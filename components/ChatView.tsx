import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, radii, spacing } from '../constants/theme';
import { Message } from '../types';
import { sendMessage, listenMessages } from '../services/firestore';

interface Props {
  myUid: string;
  friendId: string;
  friendName: string;
  friendColor: string;
  onBack: () => void;
}

export default function ChatView({ myUid, friendId, friendName, friendColor, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsub = listenMessages(myUid, friendId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    });
    return unsub;
  }, [myUid, friendId]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText('');
    await sendMessage(myUid, friendId, t);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={[styles.avatar, { backgroundColor: friendColor }]}>
          <Text style={styles.avatarLetter}>{friendName[0]}</Text>
        </View>
        <Text style={styles.name}>{friendName}</Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        style={styles.list}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => {
          const isMe = item.from === myUid;
          return (
            <View style={[styles.bubble, isMe && styles.bubbleMe]}>
              <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
            </View>
          );
        }}
      />

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="כתוב הודעה..."
          placeholderTextColor={colors.textFaint}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send} activeOpacity={0.8}>
          <Text style={styles.sendLabel}>שלח</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  backBtn: { padding: 4 },
  backArrow: { fontSize: 22, color: colors.textMuted },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontSize: 16, fontWeight: '900', color: '#fff' },
  name: { fontSize: 16, fontWeight: '900', color: colors.text },
  list: { height: 240 },
  bubble: {
    maxWidth: '75%',
    padding: 9,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginVertical: 3,
    marginHorizontal: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.09)',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 13, color: colors.text },
  bubbleTextMe: { color: '#fff' },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    textAlign: 'right',
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendLabel: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
