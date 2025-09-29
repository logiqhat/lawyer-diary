import React from 'react';
import {
  Modal,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';

/**
 * Props (unchanged):
 * - visible: boolean
 * - onClose: () => void
 * - title?: string
 * - actions: Array<{ label: string, onPress: () => void, variant?: 'default'|'danger'|'neutral', autoCloseFirst?: boolean }>
 * - showCancelButton?: boolean
 * - cancelLabel?: string
 * - footerButtons?: Array<{ label: string, onPress?: () => void, variant?: 'default'|'danger'|'neutral'|'primary', autoCloseFirst?: boolean }>
 */
export default function ActionSheetModal({
  visible,
  onClose,
  title = '',
  actions = [],
  showCancelButton = false,
  cancelLabel = 'Cancel',
  footerButtons = [],
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = Dimensions.get('window');
  const maxActionsHeight = Math.min(winH * 0.6, 480);

  const handlePress = (action) => {
    const { onPress, autoCloseFirst = true } = action;
    if (autoCloseFirst) onClose?.();
    try { onPress?.(); } finally {
      if (!autoCloseFirst) onClose?.();
    }
  };

  const renderItem = ({ item }) => {
    const variant = item.variant || 'default';
    const btnStyle =
      variant === 'danger'
        ? [styles.sheetBtn, styles.sheetBtnDanger]
        : variant === 'neutral'
        ? [styles.sheetBtn, styles.sheetBtnNeutral]
        : variant === 'primary'
        ? [styles.sheetBtn, styles.sheetBtnPrimary]
        : [styles.sheetBtn];

    const labelStyle =
      variant === 'danger'
        ? [styles.sheetBtnLabel, styles.sheetBtnLabelDanger]
        : variant === 'primary'
        ? [styles.sheetBtnLabel, styles.sheetBtnLabelPrimary]
        : [styles.sheetBtnLabel];

    return (
      <TouchableOpacity
        style={btnStyle}
        onPress={() => handlePress(item)}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        {/* Center text when short; allow horizontal scroll when long */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.btnScrollContent}
        >
          <View style={styles.btnInner}>
            <Text
              style={[labelStyle, styles.centerText]}
              numberOfLines={1}
              ellipsizeMode="clip"
            >
              {item.label}
            </Text>
          </View>
        </ScrollView>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* overlay */}
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />

      {/* bottom sheet */}
      <View style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 16) }]}>
        {!!title && <Text style={styles.sheetTitle}>{title}</Text>}

        {/* scrollable (vertical) list of actions */}
        <View style={{ width: '100%', maxHeight: maxActionsHeight }}>
          <FlatList
            data={actions}
            keyExtractor={(a, idx) => `${a.label}-${idx}`}
            renderItem={renderItem}
            showsVerticalScrollIndicator
            contentContainerStyle={styles.listContent}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={10}
            removeClippedSubviews
            getItemLayout={(_, index) => ({ length: 56, offset: 56 * index, index })}
          />
        </View>

        {showCancelButton && (
          <TouchableOpacity style={[styles.sheetBtn, styles.sheetBtnNeutral]} onPress={onClose}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.btnScrollContent}
            >
              <View style={styles.btnInner}>
                <Text style={[styles.sheetBtnLabel, styles.centerText]} numberOfLines={1}>
                  {cancelLabel}
                </Text>
              </View>
            </ScrollView>
          </TouchableOpacity>
        )}

        {footerButtons.length > 0 && (
          <View style={styles.footerRow}>
            {footerButtons.map((btn, idx) => {
              const variant = btn.variant || 'default';
              const btnStyle =
                variant === 'danger'
                  ? [styles.footerBtn, styles.sheetBtnDanger]
                  : variant === 'neutral'
                  ? [styles.footerBtn, styles.sheetBtnNeutral]
                  : variant === 'primary'
                  ? [styles.footerBtn, styles.sheetBtnPrimary]
                  : [styles.footerBtn];
              const labelStyle =
                variant === 'danger'
                  ? [styles.sheetBtnLabel, styles.sheetBtnLabelDanger]
                  : variant === 'primary'
                  ? [styles.sheetBtnLabel, styles.sheetBtnLabelPrimary]
                  : [styles.sheetBtnLabel];

              return (
                <TouchableOpacity
                  key={`${btn.label}-${idx}`}
                  style={btnStyle}
                  onPress={() => handlePress(btn)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text style={[labelStyle, styles.centerText]} numberOfLines={1}>
                    {btn.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    paddingHorizontal: 16,           // side padding for full-width buttons
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 8,
    // no alignItems: 'center' -> allows buttons to stretch full width
  },

  // Full-width button
  sheetBtn: {
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    marginTop: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  sheetBtnNeutral: { backgroundColor: colors.divider },
  sheetBtnDanger: { backgroundColor: colors.dangerBackground },
  sheetBtnPrimary: { backgroundColor: colors.primary },

  // Label styles
  sheetBtnLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.accentOnAccent,
  },
  sheetBtnLabelDanger: {
    color: colors.dangerText,
    fontWeight: '700',
  },
  sheetBtnLabelPrimary: {
    color: colors.primaryOnPrimary,
    fontWeight: '600',
  },

  // Horizontal scroll container inside each button
  btnScrollContent: {
    alignItems: 'center',
  },
  // Ensures short labels are centered; long labels can scroll
  btnInner: {
    minWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: { textAlign: 'center' },
  footerRow: {
    flexDirection: 'row',
    marginTop: 16,
    columnGap: 12,
  },
  footerBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});
