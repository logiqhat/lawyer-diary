import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import colors from '../theme/colors';

const { width, height } = Dimensions.get('window');

export default function SpeedDialTabButton(props) {
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);

  const toggle = () => setOpen(o => !o);
  const goAddCase = () => { setOpen(false); navigation.navigate('CreateCase'); };
  const goAddDate = () => { setOpen(false); navigation.navigate('AddDate'); };

  return (
    // only cover the bottom strip, and let touches through when closed
    <View style={styles.container} pointerEvents="box-none">
      {/* full-screen dark overlay, only when open */}
      {open && (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={toggle}
        />
      )}

      {/* floating action items */}
      {open && (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.actionBtn, { bottom: 140 }]} onPress={goAddCase}>
            <Ionicons name="document-text-outline" size={24} color={colors.accentOnAccent} />
            <Text style={styles.actionLabel}>Add Case</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { bottom: 80 }]} onPress={goAddDate}>
            <Ionicons name="calendar-outline" size={24} color={colors.accentOnAccent} />
            <Text style={styles.actionLabel}>Add Date</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* your FAB in the tab-bar area */}
      <TouchableOpacity
        {...props}
        onPress={toggle}
        style={styles.fabWrapper}  // does not fill the screen—only sits in the bar
      >
        <View style={styles.fab}>
          <Ionicons name={open ? 'close' : 'add'} size={36} color={colors.primaryOnPrimary} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,           // stick to the bottom
    left: 0,
    right: 0,
    alignItems: 'center',
    // no height/width here—just bottom strip
    zIndex: 10,
  },
  actions: {
    position: 'absolute',
    bottom: 30,
    width,
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 2,
  },
  actionLabel: {
    marginLeft: 8,
    color: colors.accentOnAccent,
    fontWeight: '600',
  },
  fabWrapper: {
    // this inherits the default tab-bar button size/position,
    // so it won’t cover the rest of the screen
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surface,   // white outline
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});
