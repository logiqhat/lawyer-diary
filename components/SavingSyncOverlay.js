import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import NativeAdCard from './NativeAdCard';

// stage: 0 = saving active, 1 = saving done + syncing active, 2 = all done
// mode: 'inline' (default) renders as an absolute full-screen overlay inside the current screen
//       'modal' can be added later if needed
// Default to no ad until AdMob is fully wired to avoid startup crashes
export default function SavingSyncOverlay({ visible, stage = 0, onRequestClose, mode = 'inline', AdComponent = null }) {
  // Hide the keyboard whenever this overlay becomes visible
  useEffect(() => {
    if (visible) {
      try { Keyboard.dismiss(); } catch {}
    }
  }, [visible]);
  if (!visible) return null;

  const savingDone = stage >= 1;
  const syncingDone = stage >= 2;
  const syncingActive = stage === 1;

  const Row = ({ label, done, active }) => (
    <View style={styles.row}>
      {done ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.successText} />
      ) : active ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="ellipse-outline" size={20} color={colors.iconSubtle} />
      )}
      <Text style={[styles.rowText, done ? styles.rowTextDone : null]}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.fullscreen} pointerEvents="auto">
      <View style={styles.topSection}>
        <Text style={styles.title}>Saving and syncing your data…</Text>
        <Row label="Saving changes" done={savingDone} active={!savingDone && stage === 0} />
        <Row label="Syncing with cloud" done={syncingDone} active={syncingActive} />
        <Text style={styles.hint}>Please keep the app open. This may take a few seconds.</Text>
      </View>

      {/* Placeholder ad area. Pass an AdComponent later to render a native ad here. */}
      <View style={styles.adArea}>
        <AdComponent />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface, // solid so it feels like same screen overtaken
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 16,
    justifyContent: 'space-between',
    zIndex: 999,
  },
  topSection: {
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  rowText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  rowTextDone: {
    color: colors.successText,
    fontWeight: '700',
  },
  hint: {
    marginTop: 12,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  adArea: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adPlaceholder: {
    width: '96%',
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  adText: {
    color: colors.textSecondary,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
