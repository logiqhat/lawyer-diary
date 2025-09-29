import Constants from 'expo-constants';

function readExtra() {
  // Works in both Expo dev client and bare
  return Constants?.expoConfig?.extra ?? Constants?.manifest?.extra ?? {};
}

export function getDbProvider() {
  // ENV has priority so CI/build-time can flip
  const env = (process.env.EXPO_PUBLIC_DB_PROVIDER || process.env.DB_PROVIDER || '').toLowerCase();
  if (env === 'watermelon' || env === 'sqlite') return env;

  // Fallback to app.json extra
  const extra = readExtra();
  const fromConfig = (extra.dbProvider || extra.DB_PROVIDER || '').toLowerCase();
  if (fromConfig === 'watermelon' || fromConfig === 'sqlite') return fromConfig;

  // Default provider
  return 'sqlite';
}

export function usingWatermelon() {
  return getDbProvider() === 'watermelon';
}

