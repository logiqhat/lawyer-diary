// App.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';

import { store } from './store/store';
import { initDatabase } from './database/database';
import { fetchCases, resetCasesState } from './store/casesSlice';
import { fetchDates, resetCaseDatesState } from './store/caseDatesSlice';
import { migrateLoadTestData, migrateTestData, clearAllData } from './database/migrateData';
import UpcomingDatesScreen from './screens/UpcomingDatesScreen';
import CaseCalendar from './components/CaseCalendar';
import ListCasesScreen from './screens/ListCasesScreen';
import CaseDetailScreen from './screens/CaseDetailScreen';
import CreateCaseScreen from './screens/CreateCaseScreen';
import AddDateScreen from './screens/AddDateScreen';
import DateDetailScreen from './screens/DateDetailScreen';
import AccountScreen from './screens/AccountScreen';
import { PaperProvider } from 'react-native-paper';
import ActionSheetModal from './components/ActionSheetModal';
import colors from './theme/colors';
import analytics from '@react-native-firebase/analytics';
import { usingWatermelon } from './config/featureFlags';
import { useWatermelonSync } from './hooks/useWatermelonSync';
import { apiClient } from './services/apiClient';
import { clearSyncStateForUser } from './services/syncService';
import { UserSettingsProvider, useUserSettings } from './context/UserSettingsContext';
import { FeatureFlagsProvider } from './context/FeatureFlagsContext';
import { setWatermelonDbName } from './database/wmProvider';
// Deliberately do not request notification permission on startup
// import { registerForFcmTokenAsync } from './services/pushNotificationsFcm';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { impactLight } from './utils/haptics';
import * as SplashScreen from 'expo-splash-screen';
import AnimatedSplash from './components/AnimatedSplash';

// Keep native splash on while JS loads, then swap to animated splash UI
try { SplashScreen.preventAutoHideAsync(); } catch {}

// ——— navigation helper ———
const navigationRef = createNavigationContainerRef();
function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Component to handle database initialization and data loading
function AppInitializer({ children }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Initializing database...');
        // Initialize database
        await initDatabase();
        console.log('Database initialized successfully');

        // Unblock UI immediately after DB is ready
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setError(error.message);
        setIsInitialized(true); // Still show app even if initialization fails
      }
    };

    initializeApp();
  }, []);

  if (!isInitialized) {
    return <AnimatedSplash message="Loading data..." />;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text>Error: {error}</Text>
        <Text>App will continue with limited functionality</Text>
      </View>
    );
  }

  return children;
}

function AppInner() {
  const dispatch = useDispatch();
  const [isModalVisible, setModalVisible] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const cases = useSelector((s) => s.cases?.items || []);
  const dates = useSelector((s) => s.caseDates?.items || []);
  const hasAnyData = (cases && cases.length > 0) || (dates && dates.length > 0);
  const [dataGateDone, setDataGateDone] = useState(false);
  const routeNameRef = useRef();
  const previousUserIdRef = useRef(null);
  const lastFetchedForRef = useRef(undefined);
  const dataGateTimerRef = useRef(null);
  const { setTimeZone } = useUserSettings();

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      async (u) => {
        const prevUid = previousUserIdRef.current;
        const nextUid = u?.uid || null;
        const userChanged = prevUid !== nextUid;
        if (userChanged) {
          if (dataGateTimerRef.current) {
            try { clearTimeout(dataGateTimerRef.current); } catch {}
            dataGateTimerRef.current = null;
          }
          setDataGateDone(false);
          try {
            dispatch(resetCasesState());
            dispatch(resetCaseDatesState());
          } catch (err) {
            console.warn('Failed to reset local state on auth change', err?.message || err);
          }
          if (prevUid) {
            try {
              await clearSyncStateForUser(prevUid);
            } catch (err) {
              console.warn('Failed to clear sync state', err?.message || err);
            }
          }
          try {
            const targetDb = nextUid ? `lawyerdiary_${nextUid}` : 'lawyerdiary';
            setWatermelonDbName(targetDb);
          } catch (err) {
            console.warn('Failed to set Watermelon DB name', err?.message || err);
          }
        }
        previousUserIdRef.current = nextUid;
        setCurrentUser(u);
        setAuthReady(true);
      },
      (error) => {
        console.error('[firebase/auth] onAuthStateChanged error', error);
      }
    );
    return () => unsub();
  }, [clearSyncStateForUser, dispatch, resetCaseDatesState, resetCasesState, setWatermelonDbName]);

  useEffect(() => {
    if (!authReady) return;
    const uid = currentUser?.uid || null;
    if (lastFetchedForRef.current === uid) return;
    lastFetchedForRef.current = uid;
    try {
      dispatch(fetchCases());
      dispatch(fetchDates());
    } catch (err) {
      console.warn('Failed to load data after auth change', err?.message || err);
    }
  }, [authReady, currentUser, dispatch, fetchCases, fetchDates]);

  useEffect(() => {
    if (!authReady) return;
    analytics()
      .setUserId(currentUser?.uid ?? null)
      .catch((error) => console.warn('Analytics setUserId failed', error));
  }, [authReady, currentUser]);

  useEffect(() => {
    if (!authReady || !currentUser) return;
    const dbName = `lawyerdiary_${currentUser.uid}`
    try { setWatermelonDbName(dbName); } catch (e) { console.warn('Failed to set Watermelon DB name', e?.message || e); }
  }, [authReady, currentUser]);

  // Upsert user profile/settings on login (timezone etc.)
  useEffect(() => {
    if (!authReady || !currentUser) return;
    (async () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Only register for notifications if user has opted in
      let fcmToken = null;
      try {
        const pref = await AsyncStorage.getItem('settings:notifyEnabled');
        const enabled = pref === 'true';
        if (enabled) {
          const { registerForFcmTokenAsync } = await import('./services/pushNotificationsFcm');
          fcmToken = await registerForFcmTokenAsync();
        }
      } catch (e) {
        console.warn('FCM token fetch skipped/failed', e?.message || e);
      }
      try {
        // Save timezone locally for formatting
        setTimeZone && setTimeZone(tz)
      } catch {}
      apiClient
        .post('/users', {
          body: {
            displayName: currentUser.displayName || '',
            timezone: tz,
            ...(fcmToken ? { fcmToken } : {}),
          },
        })
        .catch((e) => console.warn('Users upsert failed', e?.message || e));
    })();
  }, [authReady, currentUser]);

  // Kick off initial sync and on-foreground sync when using Watermelon
  const initialSyncDone = useWatermelonSync();

  useEffect(() => {
    if (!authReady || !currentUser) {
      if (dataGateTimerRef.current) {
        try { clearTimeout(dataGateTimerRef.current); } catch {}
        dataGateTimerRef.current = null;
      }
      if (dataGateDone) setDataGateDone(false);
      return;
    }
    if (dataGateDone) return;
    if (hasAnyData) {
      if (dataGateTimerRef.current) {
        try { clearTimeout(dataGateTimerRef.current); } catch {}
        dataGateTimerRef.current = null;
      }
      setDataGateDone(true);
      return;
    }
    if (!dataGateTimerRef.current) {
      dataGateTimerRef.current = setTimeout(() => {
        dataGateTimerRef.current = null;
        setDataGateDone(true);
      }, 2000);
    }
  }, [authReady, currentUser, hasAnyData, dataGateDone]);

  // ——— your bottom tabs, with a dummy “+” button in the middle ———
  function MainTabs() {
    const caseCount = useSelector((s) => s.cases?.items?.length || 0);
    return (
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={({ route }) => ({
          headerShown: true,
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.primaryOnPrimary,
          headerTitleStyle: { fontWeight: 'bold' },
          headerBackTitleVisible: false,
          headerBackTitle: '',
          headerBackImage: () => (
            <Ionicons name="chevron-back" size={24} color={colors.primaryOnPrimary} style={{ marginLeft: 4 }} />
          ),

          tabBarShowLabel: false,
          tabBarStyle: { backgroundColor: colors.primary, height: 86 },
          tabBarActiveTintColor: colors.primaryOnPrimary,
          tabBarInactiveTintColor: colors.tabInactive,

          // map route names to header titles
          headerTitle: {
            Home: 'Home',
            Calendar: 'Calendar',
            AllCases: 'All Cases',
            Account: 'Account',
          }[route.name],

          // icons for the four real tabs
          tabBarIcon: ({ color, size, focused }) => {
            const icons = {
              Home: 'home-outline',
              Calendar: 'calendar-outline',
              AllCases: 'list-outline',
              Account: 'person-outline',
            };
            const iconName = icons[route.name];
            if (!iconName) return null;
            return (
              <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
                <Ionicons
                  name={iconName}
                  size={size + 4}
                  color={focused ? colors.primary : color}
                />
              </View>
            );
          },
        })}
      >
        <Tab.Screen name="Home" component={UpcomingDatesScreen} />
        <Tab.Screen name="Calendar" component={CaseCalendar} />

        {/* dummy “+” button opens modal */}
        <Tab.Screen
          name="Add"
          options={{
            tabBarButton: (props) => (
              <TouchableOpacity
                {...props}
                style={[props.style, styles.fabButton]}
                onPress={() => {
                  try { impactLight(); } catch {}
                  if (caseCount === 0) {
                    navigate('CreateCase');
                  } else {
                    setModalVisible(true);
                  }
                }}
              >
                <Ionicons name="add" size={32} color={colors.primaryOnPrimary} />
              </TouchableOpacity>
            ),
          }}
        >
          {() => null}
        </Tab.Screen>


        <Tab.Screen name="AllCases" component={ListCasesScreen} />
        <Tab.Screen name="Account" component={AccountScreen} />
      </Tab.Navigator>
    );
  }

  if (!authReady) {
    return <AnimatedSplash message="Signing in..." />;
  }

  // After sign-in, keep showing an animated splash
  // while we attempt the first cloud sync. If sync
  // doesn't finish within ~5 seconds, we proceed and
  // rely on local data (sync continues in background).
  if (currentUser && !initialSyncDone) {
    return <AnimatedSplash message="Syncing your data..." />;
  }

  if (currentUser && initialSyncDone && !dataGateDone) {
    return <AnimatedSplash message="Loading your data..." />;
  }

  return (
    <PaperProvider>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={colors.primary} />
        <NavigationContainer
          ref={navigationRef}
          onReady={() => {
            const initialRoute = navigationRef.getCurrentRoute()?.name;
            if (initialRoute) {
              routeNameRef.current = initialRoute;
              analytics()
                .logScreenView({ screen_name: initialRoute, screen_class: initialRoute })
                .catch((error) => console.warn('Analytics logScreenView failed', error));
            }
          }}
          onStateChange={() => {
            const previousRouteName = routeNameRef.current;
            const currentRouteName = navigationRef.getCurrentRoute()?.name;
            if (currentRouteName && currentRouteName !== previousRouteName) {
              routeNameRef.current = currentRouteName;
              analytics()
                .logScreenView({ screen_name: currentRouteName, screen_class: currentRouteName })
                .catch((error) => console.warn('Analytics logScreenView failed', error));
            }
          }}
        >
          {currentUser ? (
            // Authenticated branch: initialize DB and show main app
            <AppInitializer>
              {/* top‐level stack: tabs + full‐screen “add” flows */}
              <Stack.Navigator
                screenOptions={{
                  headerStyle: { backgroundColor: colors.primary },
                  headerTintColor: colors.primaryOnPrimary,
                  headerTitleStyle: { fontWeight: 'bold' },
                  headerBackTitleVisible: false,
                  headerBackTitle: '',
                  headerBackImage: () => (
                    <Ionicons name="chevron-back" size={24} color={colors.primaryOnPrimary} style={{ marginLeft: 4 }} />
                  ),
                }}
              >
                {/* bottom tabs */}
                <Stack.Screen
                  name="MainTabs"
                  component={MainTabs}
                  options={{ headerShown: false }}
                />

                {/* modal choices now push these stack screens */}
                <Stack.Screen
                  name="CreateCase"
                  component={CreateCaseScreen}
                  options={{ title: 'Add Case' }}
                />
                <Stack.Screen
                  name="AddDate"
                  component={AddDateScreen}
                  options={{ title: 'Add Date' }}
                />

                {/* other stack screens */}
                <Stack.Screen
                  name="CaseDetail"
                  component={CaseDetailScreen}
                  options={{ title: 'Case Details' }}
                />

                <Stack.Screen
                  name="DateDetail"
                  component={DateDetailScreen}
                  options={{ title: 'Date Details' }}
                />
                <Stack.Screen
                  name="ListCases"
                  component={ListCasesScreen}
                  options={{ title: 'All Cases' }}
                />
              </Stack.Navigator>

              {/* FAB modal (on top of tabs) */}
              <ActionSheetModal
                visible={isModalVisible}
                onClose={() => setModalVisible(false)}
                title="What would you like to add?"
                actions={[
                  { label: 'Add Case', onPress: () => navigate('CreateCase') },
                  { label: 'Add Date', onPress: () => navigate('AddDate') },
                ]}
                showCancelButton={false}
              />
            </AppInitializer>
          ) : (
            // Unauthenticated: show Login screen only
            <Stack.Navigator
              screenOptions={{
                headerStyle: { backgroundColor: colors.primary },
                headerTintColor: colors.primaryOnPrimary,
                headerTitleStyle: { fontWeight: 'bold' },
                headerBackTitleVisible: false,
                headerBackTitle: '',
              }}
            >
              <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign In' }} />
              <Stack.Screen name="Signup" component={SignupScreen} options={{ title: 'Create Account' }} />
              <Stack.Screen
                name="ForgotPassword"
                component={ForgotPasswordScreen}
                options={{ title: 'Reset Password' }}
              />
            </Stack.Navigator>
          )}
        </NavigationContainer>
      </SafeAreaProvider>
    </PaperProvider>
  );
}

export default function App() {
  const onLayoutRootView = useCallback(async () => {
    try { await SplashScreen.hideAsync(); } catch {}
  }, []);

  // Fallback: hide native splash ASAP after first JS tick
  useEffect(() => {
    let raf = requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => {});
    });
    return () => {
      try { cancelAnimationFrame(raf); } catch {}
    };
  }, []);

  return (
    <Provider store={store}>
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <UserSettingsProvider>
          <FeatureFlagsProvider>
            <AppInner />
          </FeatureFlagsProvider>
        </UserSettingsProvider>
      </View>
    </Provider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabButton: {
    marginTop: -10,
    marginLeft: 10,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 0.2,
    borderColor: colors.accent,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: colors.surface,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  sheetBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 12,
    width: '80%',
    alignItems: 'center',
  },
  sheetBtnLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.accentOnAccent,
  },
  tabIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIconActive: {
    backgroundColor: colors.primaryOnPrimary,
  },
});
