import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSelector } from 'react-redux';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { auth } from '../firebase';
import Screen from '../components/Screen';
import colors from '../theme/colors';
import { useUserTimeZone } from '../hooks/useUserTimeZone';
import { useFeatureFlags } from '../context/FeatureFlagsContext';
import { apiClient } from '../services/apiClient';
import { registerForFcmTokenAsync } from '../services/pushNotificationsFcm';

function formatDateWithTz(dateLike, tz) {
  if (!dateLike) return '—';
  try {
    const date = new Date(dateLike);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: tz,
    }).format(date);
  } catch (err) {
    try {
      return new Date(dateLike).toLocaleString();
    } catch {
      return String(dateLike);
    }
  }
}

const SUPPORT_EMAIL = 'support@legal-diary.com';

export default function AccountScreen() {
  const [user, setUser] = useState(() => auth.currentUser ?? null);
  const [signingOut, setSigningOut] = useState(false);
  const timeZone = useUserTimeZone();
  const { showUsageSummary } = useFeatureFlags() || { showUsageSummary: false };
  const caseItems = useSelector((s) => s.cases?.items || []);
  const dateItems = useSelector((s) => s.caseDates?.items || []);
  const [lastSync, setLastSync] = useState(null);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [savingNotify, setSavingNotify] = useState(false);

  const NOTIFY_ENABLED_KEY = 'settings:notifyEnabled';

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      setUser,
      (error) => console.error('[firebase/auth] account screen listener error', error)
    );
    return () => unsub();
  }, []);

  // Load last sync timestamp (Watermelon sync writes this key)
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem('sync:lastPulledAt');
        setLastSync(v ? Number(v) : null);
      } catch {
        setLastSync(null);
      }
    })();
  }, []);

  // Load saved notification preference
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(NOTIFY_ENABLED_KEY);
        if (saved != null) setNotifyEnabled(saved === 'true');
      } catch {}
    })();
  }, []);

  const updateNotifyPref = async (nextEnabled) => {
    if (savingNotify) return;
    setSavingNotify(true);
    try {
      // Persist locally first for snappy UI
      setNotifyEnabled(nextEnabled);
      try { await AsyncStorage.setItem(NOTIFY_ENABLED_KEY, String(nextEnabled)); } catch {}

      // If enabling, make sure we have permission and a token
      let fcmToken = null;
      if (nextEnabled) {
        try {
          fcmToken = await registerForFcmTokenAsync();
        } catch (e) {
          console.warn('Notification permission/token error', e?.message || e);
        }
      }

      // Upsert preference on backend (token optional)
      try {
        await apiClient.post('/users', {
          body: { notifyEnabled: !!nextEnabled, ...(fcmToken ? { fcmToken } : {}) },
        });
      } catch (e) {
        console.warn('Failed to update notification preference', e?.message || e);
      }
    } finally {
      setSavingNotify(false);
    }
  };

  const initials = useMemo(() => {
    const source = user?.displayName || user?.email || '';
    return source ? source.trim().charAt(0).toUpperCase() : '?';
  }, [user]);

  const email = user?.email || 'Unknown email';
  const displayName = user?.displayName;
  // provider and uid intentionally omitted from UI
  const createdAt = user?.metadata?.creationTime;
  // const lastSignIn = user?.metadata?.lastSignInTime; // removed from UI
  // App version section removed from UI

  // Usage summary
  const casesCount = caseItems.length;
  const datesCount = dateItems.length;
  // Next 7 days summary removed by request

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    let googleSignedIn = false;
    try {
      googleSignedIn = await GoogleSignin.isSignedIn();
    } catch (err) {
      console.warn('Google sign-in status check failed', err);
    }
    try {
      if (googleSignedIn) {
        await GoogleSignin.revokeAccess();
        await GoogleSignin.signOut();
      }
    } catch (err) {
      console.warn('Google revoke/sign out skipped or failed', err);
    }
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Sign out failed', err);
      setSigningOut(false);
    }
  };

  const showSupportContactInfo = () => {
    Alert.alert('Contact support', `Please reach us at ${SUPPORT_EMAIL} and we'll assist you.`);
  };

  const openSupportEmail = async (subject) => {
    const body = `Hi Lawyer Diary team,

Please share details to help us assist you faster:
- What happened?
- What did you expect?
- Any screenshots or notes?

Account email: ${email}`;

    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const canOpen = await Linking.canOpenURL(mailto);
      if (canOpen) {
        await Linking.openURL(mailto);
      } else {
        console.warn('No email app available for support contact');
        showSupportContactInfo();
      }
    } catch (err) {
      console.warn('Failed to start support email', err);
      showSupportContactInfo();
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.avatar} accessibilityRole="image" accessibilityLabel={`User avatar for ${email}`}>
            <Text style={styles.avatarLabel}>{initials}</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.overline}>Logged in as</Text>
            <Text style={styles.email}>{email}</Text>
            {displayName ? <Text style={styles.displayName}>{displayName}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Details</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Time zone</Text>
            <Text style={styles.rowValue}>{timeZone || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Last sync</Text>
            <Text style={styles.rowValue}>
              {lastSync ? formatDateWithTz(lastSync, timeZone) : 'Not synced yet'}
            </Text>
          </View>
          {/* Provider and User ID removed for user relevance */}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Created</Text>
            <Text style={styles.rowValue}>{formatDateWithTz(createdAt, timeZone)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Push notifications</Text>
            <Switch
              value={notifyEnabled}
              onValueChange={updateNotifyPref}
              disabled={savingNotify}
            />
          </View>
          {/* Last sign-in row removed by request */}
        </View>

        {showUsageSummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Usage Summary</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Cases</Text>
              <Text style={styles.rowValue}>{casesCount}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Dates</Text>
              <Text style={styles.rowValue}>{datesCount}</Text>
            </View>
          </View>
        )}

        {/* App version section removed */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & Feedback</Text>
          <Text style={styles.sectionBody}>
            Need help or noticed a bug? Email us and we&apos;ll get back to you.
          </Text>
          <View style={styles.supportActions}>
            <TouchableOpacity
              onPress={() => openSupportEmail('Support request')}
              activeOpacity={0.88}
              style={[styles.supportButton, styles.supportButtonPrimary]}
              accessibilityRole="button"
              accessibilityLabel="Email support"
            >
              <Text style={[styles.supportButtonLabel, styles.supportButtonLabelPrimary]}>Contact Support</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => openSupportEmail('Bug report')}
              activeOpacity={0.88}
              style={[styles.supportButton, styles.supportButtonSecondary]}
              accessibilityRole="button"
              accessibilityLabel="Report a bug"
            >
              <Text style={[styles.supportButtonLabel, styles.supportButtonLabelSecondary]}>Report a Bug</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <Text style={styles.sectionBody}>
            Sign out to remove your credentials from this device. You can sign back in with the same email anytime.
          </Text>
          <TouchableOpacity
            onPress={handleSignOut}
            activeOpacity={0.85}
            disabled={signingOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]}
          >
            <Text style={styles.signOutLabel}>{signingOut ? 'Signing out…' : 'Sign Out'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    gap: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarLabel: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.accentOnAccent,
  },
  cardContent: {
    flex: 1,
  },
  overline: {
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  email: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  displayName: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 12,
  },
  sectionBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderMuted,
  },
  rowLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  rowValue: {
    fontSize: 14,
    color: colors.textPrimary,
    maxWidth: '60%',
    textAlign: 'right',
  },
  supportActions: {
    flexDirection: 'row',
    gap: 12,
  },
  supportButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  supportButtonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  supportButtonSecondary: {
    backgroundColor: colors.surfaceMuted,
  },
  supportButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  supportButtonLabelPrimary: {
    color: colors.primaryOnPrimary,
  },
  supportButtonLabelSecondary: {
    color: colors.textPrimary,
  },
  signOutButton: {
    marginTop: 8,
    backgroundColor: colors.dangerText,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutButtonDisabled: {
    opacity: 0.75,
  },
  signOutLabel: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});
