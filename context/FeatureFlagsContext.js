import React, { createContext, useContext, useEffect, useState } from 'react'
import { AppState } from 'react-native'

const Ctx = createContext({
  enableAds: false,
  ready: false,
})

export function FeatureFlagsProvider({ children }) {
  const [flags, setFlags] = useState({
    enableAds: false,
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let rc;
    let appStateSub;
    let isMounted = true;

    const refreshFlags = async (reason = 'unknown') => {
      if (!rc) return;
      try {
        const activated = await rc.fetchAndActivate();
        const enableAds = rc.getValue('enable_ads').asBoolean();
        if (!isMounted) return;
        try {
          console.log('[RemoteConfig]', {
            reason,
            activated,
            enable_ads: enableAds,
          });
        } catch {}
        setFlags({ enableAds });
      } catch (e) {
        if (!isMounted) return;
        console.warn('RemoteConfig fetch failed', e?.message || e);
        setFlags({ enableAds: false });
      }
    };

    (async () => {
      try {
        // Dynamically require to avoid hard crash if module isn't installed yet
        const mod = require('@react-native-firebase/remote-config');
        rc = mod?.default ? mod.default() : mod();
        // Default values (global)
        await rc.setDefaults({ enable_ads: false });
        // Fetch once on app launch; Remote Config enforces the fetch interval
        await rc.setConfigSettings({
          minimumFetchIntervalMillis: __DEV__ ? 0 : 60 * 60 * 1000,
        });

        // Initial fetch on cold start
        await refreshFlags('initial_mount');

        // Also refresh when app returns to foreground (warm start)
        appStateSub = AppState.addEventListener('change', (state) => {
          if (state === 'active') {
            refreshFlags('app_state_active');
          }
        });
      } catch (e) {
        if (isMounted) {
          console.warn('RemoteConfig init failed', e?.message || e);
          setFlags({ enableAds: false });
        }
      } finally {
        if (isMounted) setReady(true);
      }
    })();

    return () => {
      isMounted = false;
      appStateSub?.remove?.();
    };
  }, [])

  return <Ctx.Provider value={{ ...flags, ready }}>{children}</Ctx.Provider>
}

export function useFeatureFlags() {
  return useContext(Ctx)
}
