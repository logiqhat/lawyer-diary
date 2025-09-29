import messaging from '@react-native-firebase/messaging'
import { Platform, PermissionsAndroid } from 'react-native'

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

