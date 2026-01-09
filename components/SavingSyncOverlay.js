// components/SavingSyncOverlay.js
import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Share } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import colors from '../theme/colors'
import NativeCardAd from './NativeCardAd'
import { useFeatureFlags } from '../context/FeatureFlagsContext'

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.logiqhat.lawyerdiary'
const NOTIFY_ENABLED_KEY = 'settings:notifyEnabled'

// Props:
// - visible: boolean — show/hide overlay
// - stage: number — 0: saving active, 1: saving done + syncing active, 2: all done
// - onContinue: function — called when Continue is pressed
// - continueLabel: string — button label
export default function SavingSyncOverlay({ visible, stage = 0, onContinue, continueLabel = 'Continue', errorText = '' }) {
  if (!visible) return null

  const { enableAds } = useFeatureFlags() || { enableAds: false }

  const savingDone = stage >= 1
  const syncingDone = stage >= 2
  const syncingActive = stage === 1
  const hasError = !!String(errorText || '').trim()
  const [showFallback, setShowFallback] = useState(false)
  const timeoutRef = useRef(null)
  const [remindersOff, setRemindersOff] = useState(false)

  const handleShareApp = async () => {
    try {
      const message = `I'm using Lawyer Diary to track my cases and dates. Get it on Google Play: ${PLAY_STORE_URL}`
      await Share.share({ message })
    } catch (e) {
      console.warn('Share app failed', e?.message || e)
    }
  }

  const refreshReminderStatus = async () => {
    try {
      const saved = await AsyncStorage.getItem(NOTIFY_ENABLED_KEY)
      const prefEnabled = saved === 'true'
      setRemindersOff(!prefEnabled)
    } catch (e) {
      console.warn('Failed to load reminder preference (overlay)', e?.message || e)
      setRemindersOff(false)
    }
  }

  // If ad fails to load within a reasonable time, or explicitly errors, show fallback card
  useEffect(() => {
    if (!visible) {
      setShowFallback(false)
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      setRemindersOff(false)
      return
    }
    refreshReminderStatus()
    // If we already have an error (e.g., offline), show fallback immediately and skip timer
    if (hasError) {
      setShowFallback(true)
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      return
    }
    // Otherwise, arm timer and wait before showing fallback
    setShowFallback(false)
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    timeoutRef.current = setTimeout(() => setShowFallback(true), 4000)
    return () => { if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null } }
  }, [visible, hasError])

  useEffect(() => {
    if (!visible || stage < 2) return
    refreshReminderStatus()
  }, [visible, stage])

  const Row = ({ label, done, active, error }) => (
    <View style={styles.row}>
      {error ? (
        <Ionicons name="close-circle" size={22} color={colors.dangerText} />
      ) : done ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.successText} />
      ) : active ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="ellipse-outline" size={20} color={colors.iconSubtle} />
      )}
      <Text style={[styles.rowText, done ? styles.rowTextDone : null, error ? styles.rowTextError : null]}>{label}</Text>
    </View>
  )

  return (
    <View style={styles.fullscreen} pointerEvents="auto">
      <View style={styles.topSection}>
        <Text style={styles.title}>Saving and syncing your data…</Text>
        <Row label="Saving changes" done={savingDone} active={!savingDone && stage === 0} />
        <Row label="Syncing with cloud" done={syncingDone && !hasError} active={syncingActive && !hasError} error={hasError} />
        {syncingDone && !hasError && remindersOff && (
          <View style={styles.reminderWarning}>
            <Ionicons name="warning" size={18} color={colors.dangerText} />
            <Text style={styles.reminderWarningText}>
              Reminders are off. You can turn them on in the Account tab.
            </Text>
          </View>
        )}
        {hasError ? (
          <Text style={styles.errorHint}>Syncing with cloud failed: Not connected to Internet</Text>
        ) : (
          <Text style={styles.hint}>
            {syncingDone ? 'All set! You can continue when ready.' : 'Please keep the app open. This may take a few seconds.'}
          </Text>
        )}
      </View>

      {(syncingDone || hasError) && (
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={() => onContinue && onContinue()}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={continueLabel}
        >
          <Text style={styles.continueLabel}>{continueLabel}</Text>
        </TouchableOpacity>
      )}

      {/* Native Ad (with fallback when offline/ad fails) */}
      <View style={styles.adWrap}>
        {!enableAds || hasError || showFallback ? (
          <View style={styles.fallbackCard}>
            <View style={styles.fallbackIconWrap}>
              <Ionicons name="heart" size={22} color={colors.primaryOnPrimary} />
            </View>
            <Text style={styles.fallbackTitle}>Enjoying Lawyer Diary</Text>
            <Text style={styles.fallbackSubtitle}>Share it with your colleagues and friends.</Text>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShareApp}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Share app link"
            >
              <Ionicons name="share-outline" size={18} color={colors.primary} />
              <Text style={styles.shareButtonLabel}>Share app link</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <NativeCardAd
            onLoaded={() => {
              if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
              setShowFallback(false)
            }}
            onLoadError={() => {
              if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
              setShowFallback(true)
            }}
          />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fullscreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
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
  errorHint: {
    marginTop: 12,
    fontSize: 13,
    color: colors.dangerText,
    textAlign: 'center',
  },
  rowTextError: {
    color: colors.dangerText,
    fontWeight: '700',
  },
  adWrap: {
    width: '96%',
    alignSelf: 'center',
    marginTop: 16,
  },
  fallbackCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    // approximate height similar to native ad with media
    minHeight: 220,
  },
  fallbackIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  fallbackTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  fallbackSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  shareButton: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shareButtonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  reminderWarning: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  reminderWarningText: {
    fontSize: 13,
    color: colors.dangerText,
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
})
