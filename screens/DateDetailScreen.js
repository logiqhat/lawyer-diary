// src/screens/DateDetailScreen.js
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { useRoute, useNavigation } from '@react-navigation/native';

import Screen from '../components/Screen';
import ActionSheetModal from '../components/ActionSheetModal';
import { removeDate } from '../store/caseDatesSlice';
import { selectDateById, selectCaseById } from '../store/selectors';
import colors from '../theme/colors';
import { warningNotify, impactLight } from '../utils/haptics';

// ---------- Local date helpers (swap with ../utils/dates if you prefer) ----------
const parseYMD = (ymd) => {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ymd);
  return isNaN(d) ? null : d;
};
function useFormatLong(tz) {
  return (value) => {
    const d = typeof value === 'string' ? parseYMD(value) : value;
    if (!d) return '—';
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: tz,
      }).format(d);
    } catch {
      return d.toDateString();
    }
  };
}
const relativeDayInfo = (value) => {
  const d = typeof value === 'string' ? parseYMD(value) : value;
  if (!d) return { label: '', status: 'future' };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return { label: 'Today', status: 'today' };
  if (diffDays === 1) return { label: 'Tomorrow', status: 'future' };
  if (diffDays > 1) return { label: `In ${diffDays} days`, status: 'future' };
  if (diffDays === -1) return { label: 'Yesterday', status: 'past' };
  return { label: `${Math.abs(diffDays)} days ago`, status: 'past' };
};
// ---------------------------------------------------------------------------------

export default function DateDetailScreen() {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { dateId } = useRoute().params || {};
  const timeZone = useUserTimeZone();
  const formatLong = useFormatLong(timeZone);

  // Select from normalized slice shape: state.caseDates.items / state.cases.items
  const dateItem = useSelector(selectDateById(dateId)) || null;
  // case context (shows under header)
  const caseItem = useSelector(selectCaseById(dateItem?.caseId || '')) || null;

  const longDate = useMemo(() => formatLong(dateItem?.eventDate), [dateItem?.eventDate, formatLong]);
  const rel = useMemo(() => relativeDayInfo(dateItem?.eventDate), [dateItem?.eventDate]);

  const onEdit = () => {
    if (!dateItem) return;
    try { impactLight(); } catch {}
    navigation.navigate('AddDate', {
      caseId: dateItem.caseId,
      dateId: dateItem.id,
      eventDate: dateItem.eventDate,
      notes: dateItem.notes,
    });
  };

  const onDelete = () => {
    if (!dateItem) return;
    Alert.alert(
      'Delete Date',
      'Are you sure you want to delete this date?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try { warningNotify(); } catch {}
            dispatch(removeDate(dateItem.id));
            navigation.goBack();
          },
        },
      ]
    );
  };

  const [sheetVisible, setSheetVisible] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const missing = !dateItem;

  return (
    <Screen style={styles.screenBg}>
      <View style={styles.section}>
        <View style={styles.card}>
          {/* Header row: calendar + long date + relative chip + 3-dot menu */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.whenRow}>
              <View style={styles.iconBadge}>
                <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.whenText}>{longDate}</Text>
              {!!rel.label && (
                <Text
                  style={[
                    styles.chip,
                    rel.status === 'past' && styles.chipPast,
                    rel.status === 'today' && styles.chipToday,
                    rel.status === 'future' && styles.chipFuture,
                  ]}
                >
                  {rel.label}
                </Text>
              )}
            </View>

            {!missing && (
              <TouchableOpacity
                onPress={() => setSheetVisible(true)}
                style={styles.menuTrigger}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                accessibilityRole="button"
                accessibilityLabel="Open date actions"
              >
                <Ionicons name="ellipsis-vertical" size={18} color={colors.iconMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Case title pill */}
          {!!caseItem?.title && (
            <View style={styles.casePill}>
              <Ionicons name="briefcase-outline" size={14} color={colors.primary} />
              <Text style={styles.casePillText} numberOfLines={1}>
                {caseItem.title}
              </Text>
            </View>
          )}

          {/* Notes block */}
          <View style={styles.notesBlock}>
            <Text style={styles.blockLabel}>Notes</Text>
            {(() => {
              const hasNotes = !!String(dateItem?.notes || '').trim();
              const text = missing
                ? 'This date was deleted or not found.'
                : hasNotes
                ? dateItem.notes
                : 'No notes added yet.';
              const style = [styles.blockText, !hasNotes && !missing && styles.blockTextPlaceholder];
              return (
                <Text style={style}>
                  {text}
                </Text>
              );
            })()}
          </View>

          {!!dateItem?.photoUri && (
            <View style={styles.photoBlock}>
              <Text style={styles.blockLabel}>Photo</Text>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setViewerVisible(true)}
                accessibilityRole="imagebutton"
                accessibilityLabel="View photo"
              >
                <Image source={{ uri: dateItem.photoUri }} style={styles.photoImage} />
              </TouchableOpacity>
              <Text style={styles.photoHint}>Saved locally on this device.</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bottom action sheet */}
      <ActionSheetModal
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title="Date actions"
        actions={[
          { label: 'Edit Date', onPress: onEdit },
          { label: 'Delete Date', onPress: onDelete, variant: 'danger' },
        ]}
        showCancelButton={false}
      />

      {/* Full-screen photo viewer (pinch-to-zoom on iOS) */}
      <Modal visible={viewerVisible} transparent animationType="fade" onRequestClose={() => setViewerVisible(false)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity
            style={styles.viewerClose}
            onPress={() => setViewerVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <Ionicons name="close" size={26} color={colors.surface} />
          </TouchableOpacity>
          <ScrollView
            style={{ flex: 1, alignSelf: 'stretch' }}
            contentContainerStyle={styles.viewerScroll}
            maximumZoomScale={3}
            minimumZoomScale={1}
            centerContent
          >
            {!!dateItem?.photoUri && (
              <Image
                source={{ uri: dateItem.photoUri }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            )}
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // subtle warm background so the white card pops
  screenBg: { backgroundColor: colors.surfaceAlt },

  section: {
    marginHorizontal: 16,
    marginTop: 16,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },

  whenRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },

  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  whenText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: 8,
  },

  chip: {
    marginLeft: 8,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.inputBackground,
    color: colors.textDark,
    overflow: 'hidden',
  },
  chipPast: { backgroundColor: colors.dangerBackground, color: colors.dangerText, fontWeight: '700' },
  chipToday: { backgroundColor: colors.divider, color: colors.textDark, fontWeight: '700' },
  chipFuture: { backgroundColor: colors.successBackground, color: colors.successText, fontWeight: '700' },

  menuTrigger: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.borderLight,
  },
  // edit button removed by request; only menu trigger remains clickable

  casePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.casePillBackground,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  casePillText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '85%',
  },

  notesBlock: {
    marginTop: 6,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 12,
    padding: 12,
  },
  blockLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '700',
  },
  blockText: {
    color: colors.textDark,
    fontSize: 15,
    lineHeight: 21,
  },
  blockTextPlaceholder: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  photoBlock: {
    marginTop: 12,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 12,
    padding: 12,
  },
  photoImage: {
    marginTop: 8,
    borderRadius: 10,
    width: '100%',
    height: 220,
    backgroundColor: colors.surfaceMuted,
  },
  photoHint: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textSecondary,
  },
  // Viewer styles
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 2,
    padding: 8,
  },
  viewerScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
});
import { useUserTimeZone } from '../hooks/useUserTimeZone';
