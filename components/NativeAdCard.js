import React, { useMemo } from 'react';
import { Platform, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

// Test ad unit IDs from Google (Native Advanced)
const TEST_UNIT_ANDROID = 'ca-app-pub-3940256099942544/2247696110';
const TEST_UNIT_IOS = 'ca-app-pub-3940256099942544/3986624511';
const extraAdmob = (Constants?.expoConfig?.extra && Constants.expoConfig.extra.admob) || {};
const ANDROID_PACKAGE = 'com.logiqhat.lawyerdiary';

// Lazy require to avoid crashing if the library isn't installed yet
let NativeAdLib = null;
try {
  // eslint-disable-next-line global-require
  NativeAdLib = require('react-native-admob-native-ads');
} catch (e) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn('[NativeAdCard] AdMob native ads module not available:', e?.message || e);
  }
  NativeAdLib = null;
}

export default function NativeAdCard({
  repository,
  adUnitIdAndroid = (extraAdmob.nativeAdUnitAndroid || TEST_UNIT_ANDROID),
  adUnitIdIOS = (extraAdmob.nativeAdUnitIOS || TEST_UNIT_IOS),
  requestNonPersonalizedAdsOnly = false,
  onAdLoaded,
  onAdFailedToLoad,
  onAdImpression,
  style,
}) {
  const adUnitId = useMemo(
    () => Platform.select({ ios: adUnitIdIOS, android: adUnitIdAndroid }),
    [adUnitIdAndroid, adUnitIdIOS]
  );

  // Resolve component exports safely across versions
  const Ex = NativeAdLib || {};
  const NativeAdView = Ex.NativeAdView || Ex.default?.NativeAdView;
  const HeadlineView = Ex.HeadlineView || Ex.default?.HeadlineView;
  const TaglineView = Ex.TaglineView || Ex.default?.TaglineView;
  const AdvertiserView = Ex.AdvertiserView || Ex.default?.AdvertiserView;
  const StarRatingView = Ex.StarRatingView || Ex.default?.StarRatingView;
  const IconView = Ex.IconView || Ex.default?.IconView;
  const MediaView = Ex.MediaView || Ex.default?.MediaView;
  const CallToActionView = Ex.CallToActionView || Ex.default?.CallToActionView;
  const AdBadge = Ex.AdBadge || Ex.default?.AdBadge;

  if (!NativeAdView) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[NativeAdCard] Falling back: NativeAdView not found. Are you running in Expo Go, or missing a dev client build?');
    }
    const requestReview = async () => {
      let StoreReview = null;
      try {
        // eslint-disable-next-line global-require
        StoreReview = require('expo-store-review');
      } catch (_) {}
      try {
        if (StoreReview && (await StoreReview.isAvailableAsync?.())) {
          await StoreReview.requestReview();
          return;
        }
      } catch (_) {}
      try {
        if (Platform.OS === 'android') {
          const url = `market://details?id=${ANDROID_PACKAGE}`;
          const web = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
          const can = await Linking.canOpenURL(url);
          await Linking.openURL(can ? url : web);
        } else {
          // Fallback: open App Store (replace with your app URL when available)
          await Linking.openURL('https://apps.apple.com/app');
        }
      } catch (_) {}
    };

    return (
      <View style={[styles.reviewCard, style]}>
        <View style={styles.reviewIconWrap}>
          <Ionicons name="star" size={22} color={colors.primaryOnPrimary} />
        </View>
        <Text style={styles.reviewTitle}>Enjoying LawyerDiary?</Text>
        <Text style={styles.reviewSubtitle}>Please take a moment to rate us on the store.</Text>
        <TouchableOpacity onPress={requestReview} activeOpacity={0.9} style={styles.reviewButton}>
          <Text style={styles.reviewButtonText}>Rate Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <NativeAdView
      style={[styles.card, style]}
      adUnitID={adUnitId}
      repository={repository}
      requestNonPersonalizedAdsOnly={requestNonPersonalizedAdsOnly}
      onAdLoaded={onAdLoaded}
      onAdFailedToLoad={onAdFailedToLoad}
      onAdImpression={onAdImpression}
    >
      <View style={styles.topRow}>
        <AdBadge style={styles.badge} textStyle={styles.badgeText} />
        <StarRatingView style={styles.stars} />
      </View>

      <View style={styles.mainRow}>
        <IconView style={styles.icon} />
        <View style={styles.texts}>
          <HeadlineView style={styles.headline} numberOfLines={1} />
          <AdvertiserView style={styles.advertiser} numberOfLines={1} />
          <TaglineView style={styles.tagline} numberOfLines={2} />
        </View>
      </View>

      <MediaView style={styles.media} />
      <CallToActionView style={styles.cta} textStyle={styles.ctaText} />
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '96%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    padding: 12,
    alignSelf: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: colors.accentOnAccent,
    fontSize: 10,
    fontWeight: '700',
  },
  stars: { height: 12 },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  icon: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.surfaceMuted },
  texts: { flex: 1 },
  headline: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  advertiser: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  tagline: { fontSize: 12, color: colors.textDark, marginTop: 4 },
  media: { width: '100%', height: 120, borderRadius: 8, backgroundColor: colors.surfaceMuted },
  cta: {
    marginTop: 10,
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ctaText: { color: colors.primaryOnPrimary, fontWeight: '700' },

  placeholder: {
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
    alignSelf: 'center',
  },
  placeholderText: { color: colors.textSecondary },
  reviewCard: {
    width: '96%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignSelf: 'center',
    alignItems: 'center',
  },
  reviewIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  reviewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  reviewSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  reviewButton: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  reviewButtonText: { color: colors.primaryOnPrimary, fontWeight: '700' },
});
