// plugins/withAdMobAppId.js
// Minimal Expo config plugin to ensure the AdMob App ID meta-data is present
// under <application> in AndroidManifest.xml after `expo prebuild`.

const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

module.exports = function withAdMobAppId(config) {
  return withAndroidManifest(config, (c) => {
    const mod = c.modResults;
    const root = mod && mod.manifest ? mod.manifest : null;
    if (!root) return c;

    // Ensure package exists (some toolchains require it explicitly)
    try {
      const pkg = config?.android?.package;
      if (pkg && !root.$.package) root.$.package = pkg;
    } catch {}

    // Ensure tools namespace (required for tools:replace on property)
    try {
      if (!root.$['xmlns:tools']) root.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    } catch {}

    // Resolve App ID from app config (expo.extra.admob.appIdAndroid)
    const appIdAndroid = config?.extra?.admob?.appIdAndroid || null;
    if (appIdAndroid) {
      // Directly manipulate manifest JSON to ensure the meta-data is a child of <application>
      const apps = root.application = root.application || [{}];
      const app = apps[0];
      const meta = app['meta-data'] = app['meta-data'] || [];
      // Remove existing APPLICATION_ID entries
      for (let i = meta.length - 1; i >= 0; i -= 1) {
        const it = meta[i];
        if (it?.$ && it.$['android:name'] === 'com.google.android.gms.ads.APPLICATION_ID') meta.splice(i, 1);
      }
      meta.push({ $: { 'android:name': 'com.google.android.gms.ads.APPLICATION_ID', 'android:value': appIdAndroid, 'tools:replace': 'android:value' } });

      // Ensure Ad Services property exists under <application>
      const props = app.property = app.property || [];
      // Remove duplicates
      for (let i = props.length - 1; i >= 0; i -= 1) {
        const it = props[i];
        if (it?.$ && it.$['android:name'] === 'android.adservices.AD_SERVICES_CONFIG') props.splice(i, 1);
      }
      props.push({
        $: {
          'android:name': 'android.adservices.AD_SERVICES_CONFIG',
          'android:resource': '@xml/gma_ad_services_config',
          'tools:replace': 'android:resource',
        },
      });
    }

    // Defensive: keep only the root 'manifest' key to avoid <root> wrapper
    Object.keys(c.modResults).forEach((k) => { if (k !== 'manifest') delete c.modResults[k]; });

    return c;
  });
};
