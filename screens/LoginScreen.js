// screens/LoginScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { GoogleSignin, GoogleSigninButton } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../firebase';
import colors from '../theme/colors';
import { logAuthEvent } from '../services/analytics';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const configureGoogle = async () => {
      try {
        const webClientId = Constants?.expoConfig?.extra?.googleWebClientId;
        if (!webClientId) {
          console.warn('Missing googleWebClientId in app config.');
        }
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        GoogleSignin.configure({ webClientId });
      } catch (error) {
        console.warn('Google Sign-In configuration failed:', error?.message || error);
      }
    };
    configureGoogle();
  }, []);

  const showError = (message) => {
    Alert.alert('Sign In Error', message || 'Something went wrong, please try again.');
  };

  const handleEmailLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6 || loading) return;
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
      logAuthEvent('login', 'success', { method: 'password' });
    } catch (error) {
      logAuthEvent('login', 'error', {
        method: 'password',
        error_code: error?.code || 'unknown',
      });
      console.error('[firebase/auth] Email login failed', error);
      showError(error?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await GoogleSignin.revokeAccess().catch(() => {});
      await GoogleSignin.signOut().catch(() => {});
      const result = await GoogleSignin.signIn();
      const idToken = result?.data?.idToken;
      if (!idToken) {
        throw new Error('Authentication failure');
      }
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
      logAuthEvent('login', 'success', { method: 'google' });
    } catch (error) {
      logAuthEvent('login', 'error', {
        method: 'google',
        error_code: error?.code || 'unknown',
      });
      console.error('[firebase/auth] Google sign-in failed', error);
      showError(error?.message);
    }
  };

  const canSubmit = email.trim() !== '' && password.length >= 6 && !loading;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>          
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={colors.placeholder}
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                placeholder="••••••••"
                placeholderTextColor={colors.placeholder}
                returnKeyType="done"
                onSubmitEditing={handleEmailLogin}
              />
            </View>

            <TouchableOpacity
              style={styles.inlineLink}
              onPress={() => navigation?.navigate?.('ForgotPassword')}
            >
              <Text style={styles.inlineLinkLabel}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, !canSubmit && styles.disabled]}
              disabled={!canSubmit}
              onPress={handleEmailLogin}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryOnPrimary} />
              ) : (
                <Text style={styles.primaryLabel}>Log In</Text>
              )}
            </TouchableOpacity>

            <View style={styles.footerLinks}>
              <Text style={styles.footerText}>Don't have an account?</Text>
              <TouchableOpacity onPress={() => navigation?.navigate?.('Signup')}>
                <Text style={styles.footerLink}>Create Account</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerLabel}>OR</Text>
              <View style={styles.line} />
            </View>

            <GoogleSigninButton
              style={styles.googleButton}
              size={GoogleSigninButton.Size.Wide}
              color={GoogleSigninButton.Color.Dark}
              onPress={handleGoogleLogin}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  content: { flexGrow: 1 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 32,
  },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  inlineLink: { alignSelf: 'flex-end', marginTop: 4 },
  inlineLinkLabel: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  primaryButton: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: colors.primaryOnPrimary },
  disabled: { opacity: 0.5 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerLabel: {
    marginHorizontal: 12,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  googleButton: { width: '100%', height: 48 },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: { color: colors.textSecondary, fontSize: 14 },
  footerLink: { color: colors.primary, fontSize: 14, fontWeight: '600', marginLeft: 6 },
});
