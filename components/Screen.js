// components/Screen.js
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import colors from '../theme/colors';

export default function Screen({ children, style }) {
  return (
    <SafeAreaView edges={['left','right']} style={[styles.container, style]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
});
