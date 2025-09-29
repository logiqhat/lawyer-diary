// components/FormInput.js
import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

export default function FormInput({
  label,
  required = false,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  numberOfLines = 1,
  onInfoPress
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label} {required && <Text style={styles.asterisk}>*</Text>}
      </Text>

      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, multiline && { height: numberOfLines * 24 }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          multiline={multiline}
          numberOfLines={numberOfLines}
        />
        {onInfoPress && (
          <TouchableOpacity
            onPress={onInfoPress}
            style={styles.iconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="information-circle-outline" size={24} color={colors.iconSubtle} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
    color: colors.textPrimary,
  },
  asterisk: {
    color: colors.dangerText,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
    color: colors.textPrimary,
  },
  iconButton: {
    marginLeft: 8,
  },
});
