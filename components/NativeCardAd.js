// NativeCardAd.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import {
  NativeAd,
  NativeAdView,
  NativeMediaView,
  NativeAsset,
  NativeAssetType,
  NativeAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";
import Constants from "expo-constants";

export function NativeCardAd({ onLoaded, onLoadError }) {
  const [nativeAd, setNativeAd] = useState(null);

  useEffect(() => {
    let mounted = true;
    const extra = (Constants.expoConfig?.extra ?? Constants.manifest?.extra) || {};
    const unitId = (extra?.admob?.adUnits?.native && String(extra.admob.adUnits.native).trim()) || TestIds.NATIVE;
    NativeAd.createForAdRequest(unitId)
      .then((ad) => {
        if (!mounted) return;
        setNativeAd(ad);
        try { onLoaded && onLoaded(); } catch {}
      })
      .catch((e) => {
        console.warn("[NativeAd] load failed", e?.message || e);
        try { onLoadError && onLoadError(e); } catch {}
      });
    return () => {
      mounted = false;
      try { nativeAd?.destroy?.(); } catch {}
    };
  }, []);

  // Log when an ad impression is recorded
  useEffect(() => {
    if (!nativeAd) return undefined;
    const sub = nativeAd.addAdEventListener(NativeAdEventType.IMPRESSION, () => {
      try {
        // Include responseId if available for traceability
        console.log('[NativeAd] impression recorded', nativeAd?.responseId || '');
      } catch {}
    });
    return () => {
      try { sub?.remove?.(); } catch {}
    };
  }, [nativeAd]);

  // Destroy the ad when it is replaced/unmounted
  useEffect(() => () => {
    try { nativeAd?.destroy?.(); } catch {}
  }, [nativeAd]);

  if (!nativeAd) return null;

  return (
    <NativeAdView nativeAd={nativeAd} style={styles.container}>
      {/* Ad attribution per policy */}
      <Text style={styles.adBadge}>Ad</Text>

      <View style={styles.row}>
        {nativeAd.icon ? (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{ uri: nativeAd.icon.url }} style={styles.icon} />
          </NativeAsset>
        ) : (
          <View style={[styles.icon, { backgroundColor: "#eee" }]} />
        )}
        <View style={{ flex: 1 }}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={styles.headline}>{nativeAd.headline}</Text>
          </NativeAsset>
          {!!nativeAd.advertiser && (
            <NativeAsset assetType={NativeAssetType.ADVERTISER}>
              <Text style={styles.advertiser}>{nativeAd.advertiser}</Text>
            </NativeAsset>
          )}
          {!!nativeAd.starRating && (
            <NativeAsset assetType={NativeAssetType.STAR_RATING}>
              <Text style={styles.rating}>{"★".repeat(Math.round(nativeAd.starRating))}</Text>
            </NativeAsset>
          )}
        </View>
      </View>

      {!!nativeAd.body && (
        <NativeAsset assetType={NativeAssetType.BODY}>
          <Text numberOfLines={2} style={styles.tagline}>{nativeAd.body}</Text>
        </NativeAsset>
      )}

      <NativeMediaView style={styles.media} />

      {!!nativeAd.callToAction && (
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <Text style={[styles.cta, styles.ctaText]}>{nativeAd.callToAction}</Text>
        </NativeAsset>
      )}
    </NativeAdView>
  );
}

export default NativeCardAd;

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  adBadge: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 8, backgroundColor: "#eee" },
  headline: { fontSize: 16, fontWeight: "600", marginBottom: 2 },
  advertiser: { fontSize: 12, opacity: 0.7 },
  rating: { height: 16, marginTop: 4 },
  tagline: { fontSize: 14, marginVertical: 8, opacity: 0.9 },
  media: { width: "100%", height: 180, borderRadius: 12, backgroundColor: "#eee" },
  cta: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 10,
    backgroundColor: "#e5e7eb",
  },
  ctaText: { fontWeight: "700" },
});
