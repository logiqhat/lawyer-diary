// src/screens/ListCasesScreen.js
import React from 'react';
import { useSelector } from 'react-redux';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Screen from '../components/Screen';
import { useNavigation } from '@react-navigation/native';
import colors from '../theme/colors';

export default function ListCasesScreen() {
  const navigation = useNavigation();
  const cases = useSelector((state) => state.cases?.items || []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      onPress={() =>
        navigation.navigate('CaseDetail', {
          caseId: item.id,
          title: item.title,
        })
      }
      style={styles.touchable}
    >
      <View style={styles.itemContainer}>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {item.details}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={colors.iconMuted} />
      </View>
    </TouchableOpacity>
  );

  const EmptyState = () => (
    <View style={styles.emptyBox}>
      <View style={styles.emojiCircle}>
        <Text style={styles.emoji}>🧑‍⚖️</Text>
      </View>
      <Text style={styles.emptyTitle}>Give this app something to argue.</Text>
      <Text style={styles.emptySubtitle}>
        Tap the button below to add your first case.
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('CreateCase')}
      >
        <Ionicons name="add" size={18} color={colors.primaryOnPrimary} />
        <Text style={styles.primaryButtonText}>Add Case</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <FlatList
      data={cases}
      keyExtractor={(c) => c.id.toString()}
      renderItem={renderItem}
      ListEmptyComponent={<EmptyState />}
      contentContainerStyle={cases.length ? styles.list : styles.emptyContainer}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
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
  emoji: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 4,
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
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: {
    color: colors.primaryOnPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },

  touchable: {
    marginVertical: 8,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  textContainer: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
