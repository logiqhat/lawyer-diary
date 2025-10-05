// plugins/withAdServicesConfig.js
// Ensures the app Manifest overrides android.adservices.AD_SERVICES_CONFIG
// with the AdMob resource and adds AD_ID permission during prebuild.

const { withAndroidManifest, withInfoPlist, AndroidConfig } = require('@expo/config-plugins');

module.exports = function withAdServicesConfig(config) {
  // Android manifest modifications
  config = withAndroidManifest(config, (c) => {
    const manifest = c.modResults;

    // Ensure tools namespace
    if (!manifest.manifest.$['xmlns:tools']) {
      manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // Ensure package attribute on <manifest> (some toolchains require it even with Gradle namespace)
    try {
      const androidPkg = (config.android && config.android.package) || null;
      if (androidPkg && !manifest.manifest.$.package) {
        manifest.manifest.$.package = androidPkg;
      }
    } catch {}

    // Add/replace property under <application>
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    if (!app.property) app.property = [];
    app.property = app.property.filter(
      (p) => !(p?.$ && p.$['android:name'] === 'android.adservices.AD_SERVICES_CONFIG')
    );
    app.property.push({
      $: {
        'android:name': 'android.adservices.AD_SERVICES_CONFIG',
        'android:resource': '@xml/gma_ad_services_config',
        'tools:replace': 'android:resource',
      },
    });

    // Ensure AD_ID permission exists
    const root = manifest.manifest;
    if (!root['uses-permission']) root['uses-permission'] = [];
    const hasAdId = root['uses-permission'].some(
      (u) => u?.$ && u.$['android:name'] === 'com.google.android.gms.permission.AD_ID'
    );
    if (!hasAdId) {
      root['uses-permission'].push({ $: { 'android:name': 'com.google.android.gms.permission.AD_ID' } });
    }

    // Inject Google Mobile Ads App ID from app.json extra if provided
    try {
      const appId = (config?.extra && config.extra.admob && config.extra.admob.appIdAndroid) || null;
      if (appId) {
        AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(manifest, 'com.google.android.gms.ads.APPLICATION_ID');
        AndroidConfig.Manifest.addMetaDataItemToMainApplication(manifest, 'com.google.android.gms.ads.APPLICATION_ID', appId);
      }
    } catch {}

    return c;
  });

  // iOS Info.plist modifications
  config = withInfoPlist(config, (c) => {
    try {
      const fromExtra = (config?.extra && config.extra.admob && config.extra.admob.appIdIOS) || null;
      if (fromExtra) c.modResults.GADApplicationIdentifier = fromExtra;
    } catch {}
    return c;
  });

  return config;
};
