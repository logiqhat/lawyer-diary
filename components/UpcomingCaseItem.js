// components/UpcomingCaseItem.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

const MONTHS_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'
];

export default function UpcomingCaseItem({ date, clientName, oppositePartyName, caseId, onPress, timeZone }) {
  const d = typeof date === 'string' ? new Date(date) : date;
  let day = d.getDate();
  let monthShort = MONTHS_SHORT[d.getMonth()];
  let year = d.getFullYear();
  try {
    const parts = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone }).formatToParts(d);
    const pMonth = parts.find((p) => p.type === 'month')?.value;
    const pDay = parts.find((p) => p.type === 'day')?.value;
    const pYear = parts.find((p) => p.type === 'year')?.value;
    if (pMonth) monthShort = pMonth;
    if (pDay) day = Number(pDay);
    if (pYear) year = Number(pYear);
  } catch {}

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.dateBox}>
        <Text style={styles.dateDayMonth}>{`${day} ${monthShort}`}</Text>
        <Text style={styles.dateYear}>{year}</Text>
      </View>
      <View style={styles.infoBox}>
        <View style={styles.textGroup}>
          <Text style={styles.title} numberOfLines={1}>{clientName}</Text>
          <Text style={styles.title} numberOfLines={1}>vs</Text>
          <Text style={styles.title} numberOfLines={1}>{oppositePartyName}</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={colors.iconMuted} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    minHeight: 100 // ensure sufficient height
  },
  dateBox: {
    width: 80,
    backgroundColor: colors.iconMuted,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  dateDayMonth: {
    color: colors.primaryOnPrimary,
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 16,
  },
  dateYear: {
    color: colors.primaryOnPrimary,
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 16,
    marginTop: 4,
  },
  infoBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surfaceNeutral,
    justifyContent: 'space-between',
  },
  textGroup: {
    flex: 1,
    justifyContent: 'center', // vertically center text
    paddingRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    textAlign: 'center',
  }
});
