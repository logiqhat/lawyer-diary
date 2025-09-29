// components/CustomTabBar.js
import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Dimensions,
  Modal,
} from 'react-native';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

const { width, height } = Dimensions.get('window');

export default function CustomTabBar(props) {
  const { state, descriptors, navigation } = props;
  const [open, setOpen] = useState(false);

  const goAddCase = () => {
    setOpen(false);
    navigation.navigate('CreateCase');
  };
  const goAddDate = () => {
    setOpen(false);
    navigation.navigate('AddDate');
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {/* 1) Render the default tab‐bar, minus the CreateCase route */}
      <BottomTabBar
        {...props}
        state={{
          ...state,
          routes: state.routes.filter(r => r.name !== 'CreateCase'),
        }}
      />

      {/* 2) Floating FAB in the center */}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={styles.fabContainer}
      >
        <View style={styles.fab}>
          <Ionicons name="add" size={32} color={colors.primaryOnPrimary} />
        </View>
      </TouchableOpacity>

      {/* 3) Slide‐up bottom modal */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        {/* Dark overlay */}
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        />

        {/* Bottom sheet */}
        <View style={styles.bottomSheet}>
          <Text style={styles.sheetTitle}>Want to add?</Text>

          <TouchableOpacity style={styles.sheetBtn} onPress={goAddCase}>
          <Ionicons name="document-text-outline" size={20} color={colors.accentOnAccent} />
            <Text style={styles.sheetBtnLabel}>Add Case</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sheetBtn} onPress={goAddDate}>
          <Ionicons name="calendar-outline" size={20} color={colors.accentOnAccent} />
            <Text style={styles.sheetBtnLabel}>Add Date</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    width,
    bottom: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    width,
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
    color: colors.textPrimary,
  },
  sheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 12,
    width: width * 0.8,
    justifyContent: 'center',
  },
  sheetBtnLabel: {
    marginLeft: 8,
    fontSize: 16,
    color: colors.accentOnAccent,
    fontWeight: '500',
  },
});
