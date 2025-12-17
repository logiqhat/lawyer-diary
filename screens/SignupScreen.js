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

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const emailTrimmed = email.trim();
  const meetsRequirements =
    emailTrimmed !== '' &&
    password.length >= 6 &&
    password === confirmPassword;
  const isButtonDisabled = loading || !meetsRequirements;

  const handleSignup = async () => {
    const trimmedEmail = emailTrimmed;
    if (!trimmedEmail) {
      Alert.alert('Create Account', 'Please enter an email address.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Create Account', 'Password should be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Create Account', 'Passwords do not match.');
      return;
    }

    if (!meetsRequirements || loading) return;
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
      const message = error?.message || 'Unable to create account, please try again.';
      Alert.alert('Create Account', message);
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
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={[styles.input, styles.inputWithToggle]}
                value={password}
                onChangeText={setPassword}
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
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoComplete="password"
              placeholder="••••••••"
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              onSubmitEditing={handleSignup}
            />
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
            <TouchableOpacity onPress={() => navigation?.navigate?.('Login')}>
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
    paddingTop: 48,
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
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: { color: colors.textSecondary, fontSize: 14 },
  footerLink: { color: colors.primary, fontSize: 14, fontWeight: '600', marginLeft: 6 },
});
