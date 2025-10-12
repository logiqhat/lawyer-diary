import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Keyboard, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

// stage: 0 = saving active, 1 = saving done + syncing active, 2 = all done
// mode: 'inline' (default) renders as an absolute full-screen overlay inside the current screen
//       'modal' can be added later if needed
// Default to no ad until AdMob is fully wired to avoid startup crashes
import { useState } from 'react';
import { showTestInterstitialAsync } from '../services/interstitial'

export default function SavingSyncOverlay({ visible, stage = 0, onRequestClose, mode = 'inline', showContinue = false, continueLabel = 'Continue', onContinue }) {
  // Hide the keyboard whenever this overlay becomes visible
  useEffect(() => {
    if (visible) {
      try { Keyboard.dismiss(); } catch {}
    }
  }, [visible]);

  // No ads for now; overlay simply shows syncing state and a recommendation card
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
        <Text style={styles.hint}>
          {syncingDone ? 'All set! You can continue when ready.' : 'Please keep the app open. This may take a few seconds.'}
        </Text>
      </View>

      {/* Recommendation card in place of ads */}
      <View style={styles.recommendCard}>
        <View style={styles.recommendIconWrap}>
          <Ionicons name="heart" size={22} color={colors.primaryOnPrimary} />
        </View>
        <Text style={styles.recommendTitle}>Enjoying LawyerDiary?</Text>
        <Text style={styles.recommendSubtitle}>Recommend it to your friends and colleagues.</Text>
      </View>

      {syncingDone && showContinue && (
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={async () => {
            // Try to show interstitial; proceed regardless of result
            try { await showTestInterstitialAsync() } catch {}
            onContinue && onContinue()
          }}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={continueLabel}
        >
          <Text style={styles.continueLabel}>{continueLabel}</Text>
        </TouchableOpacity>
      )}
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
    justifyContent: 'flex-start',
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
  recommendCard: {
    width: '96%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignSelf: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  recommendIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  recommendTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  recommendSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  continueBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  continueLabel: {
    color: colors.primaryOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
