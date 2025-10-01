// src/screens/UpcomingDatesScreen.js
import React, { useRef, useEffect } from 'react';
import { View, SectionList, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSelector } from 'react-redux';
import UpcomingCaseItem from '../components/UpcomingCaseItem';
import { parseYMDLocal } from '../utils/dateFmt';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { useUserTimeZone } from '../hooks/useUserTimeZone';

/* ---------- Empty State Card ---------- */
function EmptyStateCard({ type, onPrimaryPress }) {
  const isCases = type === 'cases';
  const emoji = isCases ? '📁' : '📅';
  const title = isCases ? 'Add your first case.' : 'No upcoming dates.';
  const subtitle = isCases
    ? 'This diary has a clean record 😉'
    : 'No upcoming hearings. Add a hearing, deadline, or meeting to get started.';
  const cta = isCases ? 'Add Case' : 'Add Date';

  return (
    <View style={styles.emptyBox}>
      <View style={styles.emojiCircle}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>
        {subtitle}
      </Text>

      <TouchableOpacity style={styles.primaryButton} onPress={onPrimaryPress} activeOpacity={0.9}>
        <Ionicons name="add" size={18} color={colors.surface} />
        <Text style={styles.primaryButtonText}>{cta}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function UpcomingDatesScreen() {
  const navigation = useNavigation();
  const cases = useSelector((s) => s.cases?.items || []);
  const dates = useSelector((s) => s.caseDates?.items || []);
  const timeZone = useUserTimeZone();

  // Build & sort a flat list of items
  const items = dates
    .map((d) => {
      const dateObj = typeof d.eventDate === 'string' ? parseYMDLocal(d.eventDate) : d.eventDate;
      const c = cases.find((cc) => cc.id === d.caseId) || {};
      return {
        id: d.id,
        date: dateObj,
        clientName: c.clientName,
        oppositePartyName: c.oppositePartyName,
        caseId: d.caseId,
      };
    })
    .sort((a, b) => a.date - b.date);

  // Time anchors
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterStart = new Date(todayStart.getTime() + 2 * 24 * 60 * 60 * 1000);

  // Keep only today and future for this screen
  const futureItems = items.filter((it) => it.date.getTime() >= todayStart.getTime());

  // Partition into Today / Tomorrow / Upcoming
  const todayItems = [];
  const tomorrowItems = [];
  const upcomingItems = [];
  for (const it of futureItems) {
    const t = it.date.getTime();
    if (t >= todayStart.getTime() && t < tomorrowStart.getTime()) {
      todayItems.push(it);
    } else if (t >= tomorrowStart.getTime() && t < dayAfterStart.getTime()) {
      tomorrowItems.push(it);
    } else {
      upcomingItems.push(it);
    }
  }

  // Build sections (only non-empty)
  const sections = [];
  if (todayItems.length) sections.push({ title: 'Today', data: todayItems });
  if (tomorrowItems.length) sections.push({ title: 'Tomorrow', data: tomorrowItems });
  if (upcomingItems.length) sections.push({ title: 'Upcoming', data: upcomingItems });

  // First available section to scroll to
  const sectionIndex = sections.length > 0 ? 0 : -1;
  const listRef = useRef(null);

  useEffect(() => {
    if (sectionIndex >= 0) {
      listRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        viewPosition: 0,
      });
    }
  }, [sectionIndex]);

  const handlePress = (item) => {
    navigation.navigate('AddDate', {
      caseId: item.caseId,
      dateId: item.id,
    });
  };

  const hasCases = cases.length > 0;
  const showCasesEmpty = !hasCases;
  const showDatesEmpty = hasCases && sections.length === 0;

  return (
    <View style={styles.container}>
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UpcomingCaseItem
            date={item.date}
            clientName={item.clientName}
            oppositePartyName={item.oppositePartyName}
            timeZone={timeZone}
            onPress={() => handlePress(item)}
          />
        )}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.header}>
            <Text style={styles.headerText}>{title}</Text>
          </View>
        )}
        stickySectionHeadersEnabled
        onScrollToIndexFailed={() => {
          setTimeout(() => {
            if (sectionIndex >= 0) {
              listRef.current?.scrollToLocation({
                sectionIndex,
                itemIndex: 0,
                viewPosition: 0,
              });
            }
          }, 100);
        }}
        ListEmptyComponent={
          showCasesEmpty ? (
            <EmptyStateCard
              type="cases"
              onPrimaryPress={() => navigation.navigate('CreateCase')}
            />
          ) : showDatesEmpty ? (
            <EmptyStateCard
              type="dates"
              onPrimaryPress={() => navigation.navigate('AddDate')}
            />
          ) : (
            <View />
          )
        }
        contentContainerStyle={
          (showCasesEmpty || showDatesEmpty) ? styles.emptyContainer : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.inputBackground,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '700',
  },

  // Empty state layout
  emptyContainer: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBox: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  emojiCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.infoBackground,
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
  bold: { fontWeight: '700' },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryButtonText: {
    color: colors.primaryOnPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
});
