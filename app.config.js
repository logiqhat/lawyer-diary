// app.config.js
export default () => {
  const envName =
    process.env.APP_ENV || process.env.EAS_BUILD_PROFILE || process.env.NODE_ENV || 'development';
  const isProd = envName === 'production';

  const resolveApiBaseUrl = () =>
    process.env.API_BASE_URL || 'https://736n3vmsa4.execute-api.us-east-1.amazonaws.com';

  const resolveGoogleServicesFile = () =>
    process.env.GOOGLE_SERVICES_FILE || './google-services.json';

  const resolveAndroidAdmobAppId = () =>
    process.env.ADMOB_ANDROID_APP_ID ||
    (isProd ? 'ca-app-pub-5200125610280259~5768900919' : 'ca-app-pub-3940256099942544~3347511713');

  const resolveIosAdmobAppId = () =>
    process.env.ADMOB_IOS_APP_ID ||
    (isProd ? 'REPLACE_WITH_IOS_PROD_APP_ID' : 'ca-app-pub-3940256099942544~1458002511');

  const resolveAdUnits = () => ({
    // Only Native ad is used; test ID in non-prod
    native:
      process.env.ADMOB_NATIVE_AD_UNIT_ID ||
      (isProd ? '' : 'ca-app-pub-3940256099942544/2247696110'),
  });

  const devFirebase = {
    apiKey: 'AIzaSyCWcGB-YRbbTwDTLnZucd2EvWZbRxgdSc4',
    authDomain: 'lawyer-diary-d5ca7.firebaseapp.com',
    projectId: 'lawyer-diary-d5ca7',
    storageBucket: 'lawyer-diary-d5ca7.firebasestorage.app',
    messagingSenderId: '306995543731',
    appId: '1:306995543731:web:496800719e45c87e98bac6',
    measurementId: 'G-NXKQR42YC2',
  };

  const prodFirebase = {
     apiKey: 'AIzaSyCWcGB-YRbbTwDTLnZucd2EvWZbRxgdSc4',
    authDomain: 'lawyer-diary-d5ca7.firebaseapp.com',
    projectId: 'lawyer-diary-d5ca7',
    storageBucket: 'lawyer-diary-d5ca7.firebasestorage.app',
    messagingSenderId: '306995543731',
    appId: '1:306995543731:web:496800719e45c87e98bac6',
    measurementId: 'G-NXKQR42YC2',
  };

  return {
    expo: {
      name: 'Docket - Lawyer Diary',
      slug: 'LawyerDiary',
      owner: 'logiqhat',
      version: '1.2.0',
      orientation: 'portrait',
      icon: './assets/icon.png',
      userInterfaceStyle: 'light',
      newArchEnabled: true,
      splash: {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: 'com.logiqhat.lawyerdiary',
        infoPlist: {
          NSUserTrackingUsageDescription:
            'We use your device identifier to show relevant, privacy-friendly ads and support the app.',
        },
      },
      android: {
        edgeToEdgeEnabled: true,
        package: 'com.logiqhat.lawyerdiary',
        googleServicesFile: resolveGoogleServicesFile(),
        versionCode: 1,
        allowBackup: false,
        permissions: [
          'com.google.android.gms.permission.AD_ID',
          'android.permission.READ_MEDIA_IMAGES',
          'android.permission.READ_EXTERNAL_STORAGE'
        ],
        adaptiveIcon: {
          foregroundImage: './assets/adaptive-foreground.png',
          backgroundColor: '#ffffff',
        },
      },
      web: { favicon: './assets/favicon.png' },
      scheme: 'lawyerdiary',
      extra: {
        env: envName,
        dbProvider: 'watermelon',
        apiBaseUrl: resolveApiBaseUrl(),
        firebase: isProd ? prodFirebase : devFirebase,
        admob: { adUnits: resolveAdUnits() },
        // Used by Google Sign-In to mint an ID token for Firebase Auth
        googleWebClientId:
          process.env.GOOGLE_WEB_CLIENT_ID ||
          '306995543731-4dmtrus9bm8bkan739ed514q8d94r0cv.apps.googleusercontent.com',
        eas: {
         projectId: "0c0c590f-1aa2-4cb4-a2b8-c026e62864d7"
       }
      },
      plugins: [
        'expo-web-browser',
        'expo-file-system',
        '@react-native-google-signin/google-signin',
        [
          'react-native-google-mobile-ads',
          {
            iosAppId: resolveIosAdmobAppId(),
            androidAppId: resolveAndroidAdmobAppId(),
          },
        ],
        'expo-image-picker',
      ],
    },
  };
};
