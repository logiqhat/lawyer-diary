import messaging from '@react-native-firebase/messaging'
import { Platform, PermissionsAndroid, Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiClient } from './apiClient'

export async function registerForFcmTokenAsync() {
  try {
    // On Android 13+, request POST_NOTIFICATIONS permission
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
      } catch {}
    }
    const authStatus = await messaging().requestPermission()
    const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED || authStatus === messaging.AuthorizationStatus.PROVISIONAL
    if (!enabled) return null
    const token = await messaging().getToken()
    return token || null
  } catch (e) {
    console.warn('registerForFcmTokenAsync failed', e?.message || e)
    return null
  }
}

// Prompt user after first successful date add; ask permission and register token.
// Returns true if the prompt was shown (regardless of user choice), false if skipped.
export async function promptNotificationsAfterDateAdded() {
  try {
    const KEY = 'notif:askedAfterDate'
    const asked = await AsyncStorage.getItem(KEY)
    if (asked === '1') return false

    return await new Promise((resolve) => {
      try {
        Alert.alert(
          'Enable Notifications?',
          'We will notify you one day before your upcoming dates. Allow notifications?',
          [
            { text: 'Not now', style: 'cancel', onPress: async () => { try { await AsyncStorage.setItem(KEY, '1') } catch {}; resolve(true) } },
            {
              text: 'Allow notifications',
              style: 'default',
              onPress: async () => {
                try {
                  const token = await registerForFcmTokenAsync()
                  if (token) {
                    try { await apiClient.post('/users', { body: { fcmToken: token, notifyEnabled: true } }) } catch {}
                  }
                } catch (e) {
                  console.warn('Notification permission flow failed', e?.message || e)
                } finally {
                  try { await AsyncStorage.setItem(KEY, '1') } catch {}
                  resolve(true)
                }
              }
            },
          ],
          { cancelable: true }
        )
      } catch (e) {
        // If Alert fails, still set asked to avoid loops
        try { AsyncStorage.setItem(KEY, '1') } catch {}
        resolve(false)
      }
    })
  } catch (e) {
    console.warn('promptNotificationsAfterDateAdded error', e?.message || e)
    return false
  }
}
