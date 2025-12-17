// screens/ForgotPasswordScreen.js
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
import { sendPasswordResetEmail, fetchSignInMethodsForEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import { logAuthEvent } from '../services/analytics';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const emailTrimmed = email.trim();
  const isButtonDisabled = loading || emailTrimmed === '';

  const handleReset = async () => {
    const trimmedEmail = emailTrimmed;
    if (!trimmedEmail) {
      Alert.alert('Reset Password', 'Enter your account email to receive the reset link.');
      return;
    }
    if (loading || isButtonDisabled) return;
    setLoading(true);
    try {
      const methods = await fetchSignInMethodsForEmail(auth, trimmedEmail);
      const hasPasswordProvider = Array.isArray(methods) && methods.includes('password');

      if (!hasPasswordProvider) {
        const explanation =
          methods?.length
            ? 'This account is linked with Google Sign-In. Please sign in with Google or add a password from your account settings.'
            : 'No account with that email was found. Please check for typos or create an account.';
        Alert.alert('Reset Password', explanation);
        logAuthEvent('password_reset', 'error', {
          method: 'email',
          error_code: 'no_password_provider',
        });
        return;
      }

      await sendPasswordResetEmail(auth, trimmedEmail);
      logAuthEvent('password_reset', 'success', { method: 'email' });
      Alert.alert(
        'Email Sent',
        `We sent a password reset link to ${trimmedEmail}. Please check your inbox and spam folder.`,
        [{ text: 'OK', onPress: () => navigation?.goBack?.() }]
      );
    } catch (error) {
      logAuthEvent('password_reset', 'error', {
        method: 'email',
        error_code: error?.code || 'unknown',
      });
      console.error('[firebase/auth] Password reset email failed', error);
      const message = error?.message || 'Unable to send reset email. Please try again.';
      Alert.alert('Reset Password', message);
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
  
          <Text style={styles.subtitle}>
            Enter the email linked to your account and we'll email you reset instructions.
          </Text>

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
              returnKeyType="done"
              onSubmitEditing={handleReset}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, isButtonDisabled ? styles.primaryButtonDisabled : null]}
            onPress={handleReset}
            disabled={isButtonDisabled}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryOnPrimary} />
            ) : (
              <Text style={[styles.primaryLabel, isButtonDisabled ? styles.primaryLabelDisabled : null]}>
                Send Reset Link
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.footerLink}
            onPress={() => navigation?.goBack?.()}
          >
            <Text style={styles.footerLinkLabel}>Back to sign in</Text>
          </TouchableOpacity>
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
    marginBottom: 24,
    lineHeight: 20,
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
  primaryButton: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: { backgroundColor: colors.tabInactive },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: colors.primaryOnPrimary },
  primaryLabelDisabled: { color: colors.primaryOnPrimary, opacity: 0.6 },
  footerLink: {
    marginTop: 24,
    alignSelf: 'center',
  },
  footerLinkLabel: { color: colors.primary, fontSize: 14, fontWeight: '600' },
});
