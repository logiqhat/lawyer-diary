import { Platform } from 'react-native';
import Constants from 'expo-constants';

let AdManager = null;
try {
  // eslint-disable-next-line global-require
  AdManager = require('react-native-admob-native-ads').AdManager;
} catch (e) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn('[AdMob] AdManager unavailable. Build a dev client / ensure native module is linked.', e?.message || e);
  }
  AdManager = null;
}

export const AD_REPO_ID = 'syncOverlayNativeAd';
export const TEST_UNIT_ANDROID = 'ca-app-pub-3940256099942544/2247696110';
export const TEST_UNIT_IOS = 'ca-app-pub-3940256099942544/3986624511';

const extraAdmob = (Constants?.expoConfig?.extra && Constants.expoConfig.extra.admob) || {};

export function registerAdRepository({ adUnitIdAndroid = (extraAdmob.nativeAdUnitAndroid || TEST_UNIT_ANDROID), adUnitIdIOS = (extraAdmob.nativeAdUnitIOS || TEST_UNIT_IOS) } = {}) {
  if (!AdManager) return false;
  if (global.__adRepoRegistered) return true;
  const adUnitId = Platform.select({ ios: adUnitIdIOS, android: adUnitIdAndroid });
  try {
    // Library expects a single config object with `name` and `adUnitId`
    AdManager.registerRepository({
      name: AD_REPO_ID,
      adUnitId,
      numOfAds: 1,
      prefetch: 1,
    });
    global.__adRepoRegistered = true;
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[AdMob] Repository registered', { AD_REPO_ID, adUnitId });
    }
    return true;
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[AdMob] registerRepository failed', e?.message || e);
    }
    return false;
  }
}
