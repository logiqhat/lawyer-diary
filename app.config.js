// app.config.js
export default {
  expo: {
    name: "LawyerDiary",
    slug: "LawyerDiary",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.logiqhat.lawyerdiary",
      // Required for Ad/consent clarity on iOS
      infoPlist: {
        NSUserTrackingUsageDescription:
          "We use your device identifier to show relevant, privacy-friendly ads and support the app.",
      },
      // (Optional but recommended) SKAdNetwork IDs improve attribution for ad demand
      // Keep this list updated per Google docs; including Google & AdMob at minimum:
      // https://developers.google.com/admob/ios/ios14
      // skAdNetworkItems: [
      //   { skAdNetworkIdentifier: "cstr6suwn9.skadnetwork" }, // Google
      //   { skAdNetworkIdentifier: "4fzdc2evr5.skadnetwork" }, // AdMob
      // ],
    },
    android: {
      edgeToEdgeEnabled: true,
      package: "com.logiqhat.lawyerdiary",
      googleServicesFile: "./google-services.json",
      // Needed on Android 13+ for ad measurement
      permissions: ["com.google.android.gms.permission.AD_ID"],
      // (Optional) set adaptive icon
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
    },
    web: { favicon: "./assets/favicon.png" },
    scheme: "lawyerdiary",
    extra: {
      googleWebClientId:
        "306995543731-4dmtrus9bm8bkan739ed514q8d94r0cv.apps.googleusercontent.com",
      googleIosClientId: "YOUR_IOS_CLIENT_ID.apps.googleusercontent.com",
      googleAndroidClientId: "YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com",
      dbProvider: "watermelon",
      apiBaseUrl: "https://736n3vmsa4.execute-api.us-east-1.amazonaws.com",
    },
    plugins: [
      "expo-sqlite",
      "expo-web-browser",
      "expo-file-system",
      "@react-native-google-signin/google-signin",

      // ✅ IMPORTANT: initialize AdMob with your **App IDs** (NOT ad unit IDs)
      [
        "react-native-google-mobile-ads",
        {
          iosAppId: "ca-app-pub-XXXXXXXXXXXXXXXX~IOSAPPID",      // replace
          androidAppId: "ca-app-pub-5200125610280259~5768900919" 
        },
      ],

      // (Optional) If you use Google UMP consent helper in this lib, no extra plugin needed.
    ],
  },
};