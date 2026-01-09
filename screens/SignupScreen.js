// screens/SignupScreen.js
import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import { logAuthEvent } from '../services/analytics';

function isValidEmail(str) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str);
}

function friendlyAuthError(error) {
  const code = error?.code || '';
  if (code === 'auth/email-already-in-use') {
    return 'That email is already registered. Please sign in or use a different email.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/weak-password') {
    return 'Password is too weak. Please choose a stronger password.';
  }
  return 'Unable to create account, please try again.';
}

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const emailTrimmed = email.trim();
  const meetsRequirements =
    emailTrimmed !== '' &&
    isValidEmail(emailTrimmed) &&
    password.length >= 6 &&
    password === confirmPassword;
  const isButtonDisabled = loading || !meetsRequirements;

  const emailError = emailTouched
    ? (!emailTrimmed ? 'Please enter an email address.' : !isValidEmail(emailTrimmed) ? 'Please enter a valid email address.' : '')
    : '';
  const passwordError = passwordTouched
    ? (!password ? 'Please enter a password.' : password.length < 6 ? 'Password should be at least 6 characters long.' : '')
    : '';
  const confirmError = confirmTouched
    ? (!confirmPassword ? 'Please confirm your password.' : password !== confirmPassword ? 'Passwords do not match.' : '')
    : '';

  const getFirstError = () => emailError || passwordError || confirmError || '';

  const handleSignup = async () => {
    setEmailTouched(true);
    setPasswordTouched(true);
    setConfirmTouched(true);
    const validationError = getFirstError();
    if (validationError) return Alert.alert('Create Account', validationError);
    if (loading) return;
    const trimmedEmail = emailTrimmed;
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      logAuthEvent('signup', 'success', { method: 'password' });
      try {
        await signOut(auth);
      } catch (signOutError) {
        console.warn('Signup sign-out failed:', signOutError?.message || signOutError);
      }
      Alert.alert('Account Created', 'Your account has been created. Please sign in.');
      if (navigation?.canGoBack?.()) navigation.goBack();
    } catch (error) {
      logAuthEvent('signup', 'error', {
        method: 'password',
        error_code: error?.code || 'unknown',
      });
      console.error('[firebase/auth] Sign-up failed', error);
      Alert.alert('Create Account', friendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (!emailTouched && text.length > 0) setEmailTouched(true);
              }}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={colors.placeholder}
              returnKeyType="next"
            />
            {!!emailError && <Text style={styles.inlineError}>{emailError}</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={[styles.input, styles.inputWithToggle]}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (!passwordTouched && text.length > 0) setPasswordTouched(true);
                }}
                secureTextEntry={!showPassword}
                autoComplete="password"
                placeholder="••••••••"
                placeholderTextColor={colors.placeholder}
                returnKeyType="next"
              />
              <TouchableOpacity
                style={styles.toggleSecure}
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={`${showPassword ? 'Hide' : 'Show'} password`}
              >
                <Ionicons
                  name={showPassword ? 'eye' : 'eye-off'}
                  size={22}
                  color={colors.primary}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </TouchableOpacity>
            </View>
            {!!passwordError && <Text style={styles.inlineError}>{passwordError}</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                if (!confirmTouched && text.length > 0) setConfirmTouched(true);
              }}
              secureTextEntry={!showPassword}
              autoComplete="password"
              placeholder="••••••••"
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              onSubmitEditing={handleSignup}
            />
            {!!confirmError && <Text style={styles.inlineError}>{confirmError}</Text>}
          </View>

        <TouchableOpacity
          style={[styles.primaryButton, isButtonDisabled ? styles.primaryButtonDisabled : null]}
          onPress={handleSignup}
          disabled={isButtonDisabled}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryOnPrimary} />
          ) : (
            <Text style={[styles.primaryLabel, isButtonDisabled ? styles.primaryLabelDisabled : null]}>
              Create Account
            </Text>
          )}
        </TouchableOpacity>
          <View style={styles.footerLinks}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity
              onPress={() => {
                if (navigation?.canGoBack?.()) {
                  navigation.goBack();
                } else {
                  navigation?.navigate?.('Login');
                }
              }}
              style={{ paddingVertical: 8 }}
            >
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
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
    paddingTop: 24,
    paddingBottom: 32,
  },
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
  field: { marginBottom: 12 },
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
  passwordInputWrapper: { position: 'relative' },
  inputWithToggle: { paddingRight: 80 },
  toggleSecure: {
    position: 'absolute',
    right: 12,
    top: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: colors.tabInactive,
  },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: colors.primaryOnPrimary },
  primaryLabelDisabled: { color: colors.primaryOnPrimary, opacity: 0.6 },
  inlineError: {
    marginTop: 6,
    marginBottom: 0,
    color: colors.error || '#d32f2f',
    textAlign: 'left',
    fontSize: 13,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 6,
    rowGap: 4,
    marginTop: 24,
  },
  footerText: { color: colors.textSecondary, fontSize: 14 },
  footerLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
    textDecorationLine: 'underline',
  },
});
