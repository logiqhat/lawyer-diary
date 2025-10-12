// services/interstitial.js
// Shows an AdMob interstitial using react-native-google-mobile-ads if available.
// Uses Google test ad unit IDs on both platforms.

import { Platform } from 'react-native'

const TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/1033173712'
const TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910'

function resolveModule() {
  try {
    // eslint-disable-next-line global-require
    const mod = require('react-native-google-mobile-ads')
    return mod?.default || mod
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[Interstitial] google-mobile-ads not installed; skipping interstitial')
    }
    return null
  }
}

export async function showTestInterstitialAsync() {
  const mobileAds = resolveModule()
  if (!mobileAds) return false

  const { InterstitialAd, AdEventType } = mobileAds
  const adUnitId = Platform.select({ ios: TEST_INTERSTITIAL_IOS, android: TEST_INTERSTITIAL_ANDROID })

  return new Promise((resolve) => {
    try {
      const interstitial = InterstitialAd.createForAdRequest(adUnitId, {
        requestNonPersonalizedAdsOnly: true,
      })
      const unsubscribe = interstitial.onAdEvent((type, error) => {
        if (type === AdEventType.LOADED) {
          try { interstitial.show() } catch {}
        } else if (type === AdEventType.CLOSED) {
          try { unsubscribe() } catch {}
          resolve(true)
        } else if (type === AdEventType.ERROR) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[Interstitial] load/show error', error?.message || error)
          }
          try { unsubscribe() } catch {}
          resolve(false)
        }
      })
      try { interstitial.load() } catch (e) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[Interstitial] load() threw', e?.message || e)
        }
        try { unsubscribe() } catch {}
        resolve(false)
      }
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[Interstitial] failed to create interstitial', e?.message || e)
      }
      resolve(false)
    }
  })
}

