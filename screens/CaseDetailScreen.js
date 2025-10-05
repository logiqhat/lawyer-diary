// src/screens/CaseDetailScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ActionSheetModal from '../components/ActionSheetModal';
import Screen from '../components/Screen';
import { removeCase } from '../store/casesSlice';
import { parseYMDLocal } from '../utils/dateFmt';
import colors from '../theme/colors';
import { impactLight, warningNotify } from '../utils/haptics';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const BADGE_WIDTH = 84;

/** --- Badge with exact year width matching "<day> <mon>" width --- */
function DateBadge({ day, month, year }) {
  const [topWidth, setTopWidth] = useState(null);

  return (
    <View style={styles.dateBadge}>
      <Text
        style={styles.badgeTop}
        numberOfLines={1}
        onLayout={({ nativeEvent }) => {
          const w = Math.ceil(nativeEvent.layout.width);
          if (w !== topWidth) setTopWidth(w);
        }}
      >
        {`${day} ${month}`}
      </Text>

      <Text
        style={[styles.badgeYear, topWidth ? { width: topWidth } : null]}
        numberOfLines={1}
      >
        {year}
      </Text>
    </View>
  );
}

export default function CaseDetailScreen() {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { caseId, title: routeTitle } = useRoute().params || {};
  const insets = useSafeAreaInsets();

  const caseItem = useSelector((state) =>
    state.cases?.items?.find((c) => c.id === caseId)
  ) || {};

  const dates = useSelector((state) => state.caseDates?.items || [])
    .filter((d) => d.caseId === caseId)
    .sort((a, b) => parseYMDLocal(a.eventDate) - parseYMDLocal(b.eventDate));

  const pageTitle =
    routeTitle ||
    `${caseItem.clientName || 'Client'} vs ${caseItem.oppositePartyName || 'Opposing party'}`;

  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  const navigateToEditCase = () => {
    navigation.navigate('CreateCase', {
      caseId: caseItem.id,
      clientName: caseItem.clientName,
      oppositePartyName: caseItem.oppositePartyName,
      details: caseItem.details,
    });
  };

  const onEdit = () => {
    setActionSheetVisible(false);
    navigateToEditCase();
  };

  const onDelete = () => {
    setActionSheetVisible(false);
    Alert.alert(
      'Delete Case',
      'Are you sure you want to delete this case and all its dates?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try { warningNotify(); } catch {}
            dispatch(removeCase(caseItem.id));
            navigation.goBack();
          },
        },
      ]
    );
  };

  const renderDateItem = ({ item }) => {
    const d = parseYMDLocal(item.eventDate);
    const day = d.getDate();
    const month = MONTHS_SHORT[d.getMonth()];
    const year = d.getFullYear();

    return (
      <TouchableOpacity
        style={styles.dateItem}
        onPress={() => navigation.navigate('DateDetail', { dateId: item.id })}
        activeOpacity={0.9}
      >
        <DateBadge day={day} month={month} year={year} />

        <View style={styles.dateInfo}>
          {(() => {
            const hasNotes = !!String(item.notes || '').trim();
            return (
              <Text
                style={[styles.dateTitle, !hasNotes && styles.dateTitlePlaceholder]}
                numberOfLines={2}
              >
                {hasNotes ? item.notes : 'No notes added yet'}
              </Text>
            );
          })()}
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen>
      {/* Header / Case summary */}
      <View style={styles.section}>
        <TouchableOpacity
          activeOpacity={0.92}
          style={styles.heroCardWrapper}
          onPress={navigateToEditCase}
        >
          <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <TouchableOpacity
              style={styles.heroIconWrap}
              onPress={(event) => {
                event?.stopPropagation?.();
                onEdit();
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Edit case"
            >
              <Ionicons name="briefcase-outline" size={28} color={colors.iconMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={(event) => {
                event?.stopPropagation?.();
                setActionSheetVisible(true);
              }}
              style={styles.menuTrigger}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={colors.iconMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.heroTitle} numberOfLines={2}>
            {pageTitle}
          </Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaRole}>Client:</Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {caseItem.clientName || 'Client'}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaRole}>Opposite:</Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {caseItem.oppositePartyName || 'Opposing party'}
            </Text>
          </View>
          {!!caseItem.details && (
            <View style={[styles.metaRow, { marginTop: 8 }]}>
              <Text style={styles.metaRole}>Details:</Text>
              <Text style={[styles.metaText, styles.metaTextMulti]} numberOfLines={3} ellipsizeMode="tail">
                {caseItem.details}
              </Text>
            </View>
          )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Dates list */}
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>
          Dates {dates.length ? `• ${dates.length}` : ''}
        </Text>

        <FlatList
          data={dates}
          keyExtractor={(d) => d.id}
          renderItem={renderDateItem}
          contentContainerStyle={[
            styles.listContent,
            !dates.length && { flexGrow: 1, justifyContent: 'center' },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emojiCircle}>
                <Text style={styles.emoji}>📅</Text>
              </View>
              <Text style={styles.emptyTitle}>No dates for this case yet</Text>
              <Text style={styles.emptySubtitle}>
                Add a hearing, deadline, or meeting to get started.
              </Text>
            </View>
          }
        />
      </View>

      {/* FAB: icon + "Add Date" */}
      <TouchableOpacity
        style={[
          styles.fabExtended,
          { bottom: Math.max(24, insets.bottom + 16) },
        ]}
        onPress={() => { try { impactLight(); } catch {}; navigation.navigate('AddDate', { caseId, source: 'case_detail' }) }}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Add Date"
      >
        <Ionicons name="add" size={20} color={colors.primaryOnPrimary} />
        <Text style={styles.fabLabel}>Add Date</Text>
      </TouchableOpacity>

      <ActionSheetModal
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        actions={[
          { label: 'Edit Case', onPress: onEdit },
          { label: 'Delete Case', onPress: onDelete, variant: 'danger' },
        ]}
        showCancelButton={false}
      />
    </Screen>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  section: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
  },

  heroCardWrapper: {
    borderRadius: 16,
  },

  heroCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 20,
    overflow: 'hidden',
  },

  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.chipWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTrigger: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.borderMuted,
  },

  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 24,
    marginBottom: 6,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
  },
  metaRole: {
    width: 84,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingTop: 2,
  },
  metaText: {
    color: colors.textPrimary,
    fontSize: 14,
    flex: 1,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  metaTextMulti: {
    lineHeight: 20,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  listContainer: {
    flex: 1,
    paddingBottom: 24,
  },
  listContent: {
    paddingHorizontal: 16,
  },

  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },

  dateBadge: {
    width: BADGE_WIDTH,
    paddingVertical: 10,
    backgroundColor: colors.iconMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Top: measured text
  badgeTop: {
    color: colors.primaryOnPrimary,
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },

  // Bottom: force width to match top text width
  badgeYear: {
    color: colors.primaryOnPrimary,
    fontWeight: '700',
    fontSize: 16,
    marginTop: 4,
    lineHeight: 24,
    textAlign: 'center',
    alignSelf: 'center',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },

  dateInfo: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingRight: 8,
  },
  dateTitlePlaceholder: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    fontWeight: '500',
  },

  // Empty state
  emptyBox: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 16,
  },
  emojiCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chipWarm,
    marginBottom: 12,
  },
  emoji: { fontSize: 36 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 4,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 20,
  },

  // FAB (extended)
  fabExtended: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: colors.iconMuted,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabLabel: {
    color: colors.primaryOnPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
});
