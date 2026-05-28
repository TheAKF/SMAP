import React, { useEffect, useRef } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity,
  Animated, Dimensions, ScrollView, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, radii, spacing } from '../constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: number;
}

export default function Sheet({ visible, onClose, children, maxHeight = SCREEN_H * 0.75 }: Props) {
  const translateY = useRef(new Animated.Value(maxHeight)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: maxHeight, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* flex-end so the KAV + sheet sit at the bottom; backdrop is absolute so it doesn't affect flex */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Tappable backdrop — position:absolute so it's out of flex flow */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.overlay, { opacity }]} />
        </Pressable>

        {/* KeyboardAvoidingView lifts the sheet above the keyboard */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Sheet panel */}
          <Animated.View
            style={[styles.sheet, { maxHeight, transform: [{ translateY }] }]}
          >
            <TouchableOpacity style={styles.handle} onPress={onClose} activeOpacity={0.7} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  sheet: {
    backgroundColor: colors.surfaceHigh,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: spacing.lg,
    paddingBottom: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  handle: {
    width: 38,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
});

// ── Reusable sub-components used inside sheets ──────────────────────────────

export function SheetTitle({ children }: { children: string }) {
  return <Text style={sheetStyles.title}>{children}</Text>;
}

export function SheetSub({ children }: { children: string }) {
  return <Text style={sheetStyles.sub}>{children}</Text>;
}

export function SheetBtn({
  label, onPress, style: s, color,
}: {
  label: string;
  onPress: () => void;
  style?: object;
  color?: string;
}) {
  return (
    <TouchableOpacity
      style={[sheetStyles.btn, { backgroundColor: color ?? colors.primary }, s]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={sheetStyles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const sheetStyles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '900', color: colors.text, marginBottom: 4 },
  sub: { fontSize: 12, color: colors.textMuted, marginBottom: 14 },
  btn: {
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
