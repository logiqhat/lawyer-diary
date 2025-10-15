// components/SavingSyncOverlay.js
import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import colors from '../theme/colors'
import NativeCardAd from './NativeCardAd'

// Props:
// - visible: boolean — show/hide overlay
// - stage: number — 0: saving active, 1: saving done + syncing active, 2: all done
// - onContinue: function — called when Continue is pressed
// - continueLabel: string — button label
export default function SavingSyncOverlay({ visible, stage = 0, onContinue, continueLabel = 'Continue', errorText = '' }) {
  if (!visible) return null

  const savingDone = stage >= 1
  const syncingDone = stage >= 2
  const syncingActive = stage === 1
  const hasError = !!String(errorText || '').trim()
  const [showFallback, setShowFallback] = useState(false)
  const timeoutRef = useRef(null)

  // If ad fails to load within a reasonable time, or explicitly errors, show fallback card
  useEffect(() => {
    if (!visible) {
      setShowFallback(false)
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      return
    }
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
        {hasError ? (
          <Text style={styles.errorHint}>Syncing with cloud failed: Not connected to Internet</Text>
        ) : (
          <Text style={styles.hint}>
            {syncingDone ? 'All set! You can continue when ready.' : 'Please keep the app open. This may take a few seconds.'}
          </Text>
        )}
      </View>

      {/* Native Ad (with fallback when offline/ad fails) */}
      <View style={styles.adWrap}>
        {hasError || showFallback ? (
          <View style={styles.fallbackCard}>
            <View style={styles.fallbackIconWrap}>
              <Ionicons name="heart" size={22} color={colors.primaryOnPrimary} />
            </View>
            <Text style={styles.fallbackTitle}>Enjoying Lawyer Diary</Text>
            <Text style={styles.fallbackSubtitle}>share with your colleagues and friends</Text>
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
