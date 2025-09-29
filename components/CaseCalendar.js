// src/components/CaseCalendar.js (or wherever your file lives)
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { Calendar } from 'react-native-calendars';
import { useNavigation } from '@react-navigation/native';
import colors from '../theme/colors';
import { impactLight } from '../utils/haptics';

export default function CaseCalendar() {
  const navigation = useNavigation();
  const caseDates = useSelector((state) => state.caseDates?.items || []);
  const cases     = useSelector((state) => state.cases?.items || []);

  // default to today
  const todayString = getLocalTodayString();
  const [selectedDate, setSelectedDate] = useState(todayString);
  // track visible month for weekend coloring
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });

  // colors
  const lightBg      = colors.calendarMarker;
  const lightText    = colors.textDark;
  const darkBg       = colors.iconMuted;
  const selectedText = colors.textInverseSoft;
  const borderColor  = colors.borderLight;

  // ---- helpers to build and merge calendar marks ----
  const mergeMark = (base, day, overlay) => {
    if (!day) return base;
    const cur = base[day]?.customStyles || {};
    const ov = overlay?.customStyles || {};
    base[day] = {
      customStyles: {
        container: { ...(cur.container || {}), ...(ov.container || {}) },
        text: { ...(cur.text || {}), ...(ov.text || {}) },
      },
    };
    return base;
  };

  const weekendMarks = useMemo(() => {
    // Build weekend marks for the currently visible month
    const marks = {};
    const { year, month } = visibleMonth || {};
    if (!year || !month) return marks;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dt = new Date(year, month - 1, d);
      const dow = dt.getDay(); // 0=Sun, 6=Sat
      const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dow === 0) {
        // Sunday: red and bold
        marks[ds] = { customStyles: { text: { color: colors.dangerText, fontWeight: '700' } } };
      } else if (dow === 6) {
        // Saturday: red but not bold
        marks[ds] = { customStyles: { text: { color: colors.dangerText, fontWeight: 'normal' } } };
      }
    }
    return marks;
  }, [visibleMonth]);

  // 1) start with weekends, then layer case dates
  const markedDates = Object.keys(weekendMarks).reduce((acc, k) => {
    acc[k] = weekendMarks[k];
    return acc;
  }, {});

  for (const { eventDate } of caseDates) {
    mergeMark(markedDates, eventDate, {
      customStyles: {
        container: {
          width: 36,
          height: 36,
          borderRadius: 18,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: lightBg,
          borderColor,
          borderWidth: 1,
        },
        text: {
          color: lightText,
          fontWeight: '600',
        },
      },
    });
  }

  const todayHighlight = {
    container: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderColor: colors.calendarToday,
      borderWidth: 1,
    },
    text: {
      color: colors.calendarToday,
      fontWeight: '700',
    },
  };

  mergeMark(markedDates, todayString, { customStyles: todayHighlight });

  // 2) override/add the selectedDate (today or tapped) so it always shows
  if (selectedDate) {
    mergeMark(markedDates, selectedDate, {
      customStyles: {
        container: {
          width: 36,
          height: 36,
          borderRadius: 18,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: darkBg,
          borderColor: darkBg, // merge border into fill for selected
          borderWidth: 1,
        },
        text: { color: selectedText, fontWeight: '600' },
      },
    });
  }

  // 3) prepare list entries
  const entries = (selectedDate ? caseDates
    .filter((cd) => cd.eventDate === selectedDate)
    .map((cd) => {
      const parent = cases.find((c) => c.id === cd.caseId) || {};
      const client = parent.clientName || 'Client';
      const opp    = parent.oppositePartyName || 'Opposing party';
      return {
        id: cd.id,
        title: `${client} vs ${opp}`,
        // unified field name = `notes` (aliased from DB)
        note: cd.notes,
      };
    }) : []);

  const handleOpenDateDetail = (dateId) => {
    // Opens the Date Detail screen
    navigation.navigate('DateDetail', { dateId });
  };

  return (
    <View style={styles.container}>
      <Calendar
        markingType="custom"
        markedDates={markedDates}
        enableSwipeMonths
        hideExtraDays
        onDayPress={(day) => setSelectedDate(day.dateString)}
        onMonthChange={(m) => {
          setSelectedDate('');
          if (m?.year && m?.month) setVisibleMonth({ year: m.year, month: m.month });
        }}
        renderArrow={(direction) => (
          <Ionicons
            name={direction === 'left' ? 'chevron-back' : 'chevron-forward'}
            size={22}
            color={colors.iconMuted}
          />
        )}
        theme={{
          arrowColor: colors.iconMuted,
          textSectionTitleColor: colors.iconSubtle,
          todayTextColor: colors.calendarToday,
        }}
      />
      {selectedDate ? (
        <View style={styles.addBarWrap}>
          <TouchableOpacity
            style={[styles.addBtn, styles.addBtnFull]}
            onPress={() => { try { impactLight(); } catch {}; navigation.navigate('AddDate', { eventDate: selectedDate }) }}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Add Date"
          >
            <Ionicons name="add" size={18} color={colors.primaryOnPrimary} />
            <Text style={styles.addBtnLabel}>Add a date to {selectedDate}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {selectedDate ? (
        <View style={styles.listContainer}>
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.cardsPad,
              entries.length === 0 ? { flexGrow: 1, justifyContent: 'center' } : null,
            ]}
            ListEmptyComponent={
              <Text style={styles.placeholder}>No entries for {selectedDate}</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => handleOpenDateDetail(item.id)}
                style={styles.entry}
              >
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                {!!item.note && (
                  <Text style={styles.note} numberOfLines={3}>
                    {item.note}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}

// helper to get local YYYY-MM-DD
function getLocalTodayString() {
  const now = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day   = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background,
  },
  placeholder: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 24,
  },
  cardsPad: {
    paddingBottom: 12,
  },
  addBarWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  headerRow: {
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 8,
    alignItems: 'center',
  },
  entry: {
    marginBottom: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    alignItems: 'center', // center-align contents
    width: '98%',
    alignSelf: 'center',
  },
  emptyDay: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  addBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addBtnFull: {
    width: '98%',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  // removed fixed bottom CTA styles in favor of header button
  addBtnLabel: {
    color: colors.primaryOnPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary, // app text color
    textAlign: 'center',
    marginBottom: 6,
  },
  note: {
    fontSize: 14,
    color: colors.textSecondary, // subtitle color to match app
    textAlign: 'center',
    lineHeight: 20,
  },
});
