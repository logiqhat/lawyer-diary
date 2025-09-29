// App.js
import React, { useState, useEffect, useRef } from 'react';
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
import { fetchCases } from './store/casesSlice';
import { fetchDates } from './store/caseDatesSlice';
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
import { UserSettingsProvider, useUserSettings } from './context/UserSettingsContext';
import { FeatureFlagsProvider } from './context/FeatureFlagsContext';
import { registerForFcmTokenAsync } from './services/pushNotificationsFcm';
import { impactLight } from './utils/haptics';

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
  const dispatch = useDispatch();
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Initializing database...');
        // Initialize database
        await initDatabase();
        console.log('Database initialized successfully');
        
        // Load data from database
        console.log('Loading cases and dates...');
        const [casesResult, datesResult] = await Promise.allSettled([
          dispatch(fetchCases()),
          dispatch(fetchDates())
        ]);
        console.log('Data loaded successfully');
        
        // Check if both fetches were successful and returned empty results
        const casesSuccess = casesResult.status === 'fulfilled';
        const datesSuccess = datesResult.status === 'fulfilled';
        
        if (casesSuccess && datesSuccess) {
          const state = store.getState();
          if (state.cases.items.length === 0 && state.caseDates.items.length === 0) {
            console.log('No data found, populating with test data...');
          
            // await clearAllData();

            // // Reload data after migration
            // await Promise.allSettled([
            //   dispatch(fetchCases()),
            //   dispatch(fetchDates())
            // ]);
            // console.log('Test data loaded successfully');
          }
        } else {
          console.log('Some data fetches failed, but continuing...');
        }
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setError(error.message);
        setIsInitialized(true); // Still show app even if initialization fails
      }
    };

    initializeApp();
  }, [dispatch]);

  if (!isInitialized) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
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
  const [isModalVisible, setModalVisible] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const routeNameRef = useRef();
  const { setTimeZone } = useUserSettings();

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        setCurrentUser(u);
        setAuthReady(true);
      },
      (error) => {
        console.error('[firebase/auth] onAuthStateChanged error', error);
      }
    );
    return () => unsub();
  }, []);


  useEffect(() => {
    if (!authReady) return;
    analytics()
      .setUserId(currentUser?.uid ?? null)
      .catch((error) => console.warn('Analytics setUserId failed', error));
  }, [authReady, currentUser]);

  // Upsert user profile/settings on login (timezone etc.)
  useEffect(() => {
    if (!authReady || !currentUser) return;
    (async () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let fcmToken = null;
      try {
        fcmToken = await registerForFcmTokenAsync();
      } catch (e) {
        console.warn('FCM token fetch failed', e?.message || e);
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
  useWatermelonSync();

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
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
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
  return (
    <Provider store={store}>
      <UserSettingsProvider>
        <FeatureFlagsProvider>
          <AppInner />
        </FeatureFlagsProvider>
      </UserSettingsProvider>
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
