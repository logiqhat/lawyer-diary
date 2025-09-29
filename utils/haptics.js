// utils/haptics.js
import { Vibration, Platform } from 'react-native'

let Haptics = null
try {
  // Optional dependency: expo-haptics
  // eslint-disable-next-line global-require
  Haptics = require('expo-haptics')
} catch (e) {
  Haptics = null
}

function vibrate(ms = 10) {
  try { Vibration.vibrate(ms) } catch {}
}

export async function impactLight() {
  if (Haptics?.impactAsync) {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
  } else {
    vibrate(12)
  }
}

export async function impactMedium() {
  if (Haptics?.impactAsync) {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
  } else {
    vibrate(18)
  }
}

export async function successNotify() {
  if (Haptics?.notificationAsync) {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
  } else {
    vibrate(16)
  }
}

export async function warningNotify() {
  if (Haptics?.notificationAsync) {
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning) } catch {}
  } else {
    vibrate(22)
  }
}

export async function selectionChanged() {
  if (Haptics?.selectionAsync) {
    try { await Haptics.selectionAsync() } catch {}
  } else {
    if (Platform.OS === 'android') vibrate(8)
  }
}

