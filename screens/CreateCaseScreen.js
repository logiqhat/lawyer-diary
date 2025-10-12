// src/screens/CreateCaseScreen.js
import React, { useState, useLayoutEffect, useCallback, useEffect, useMemo } from 'react';
import {
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { useDispatch } from 'react-redux';
import { useNavigation, useRoute } from '@react-navigation/native';
import uuid from 'react-native-uuid';

import { addCase, updateCase } from '../store/casesSlice';
import colors from '../theme/colors';
import { impactLight, successNotify } from '../utils/haptics';
import { logGenericEvent } from '../services/analytics';
import { syncIfWatermelon } from '../services/syncService';
import SavingSyncOverlay from '../components/SavingSyncOverlay';

export default function CreateCaseScreen() {
  const dispatch   = useDispatch();
  const navigation = useNavigation();
  const route      = useRoute();

  // If editing, params will include caseId and existing fields
  const {
    caseId,
    clientName: routeClient = '',
    oppositePartyName: routeOpp = '',
    details: routeDetails = '',
    source: routeSource,
  } = route.params || {};

  // Form state, initialized from route (empty for create)
  const [clientName, setClientName]               = useState(routeClient);
  const [oppositePartyName, setOppositePartyName] = useState(routeOpp);
  const [caseDetails, setCaseDetails]             = useState(routeDetails);

  // Enable submit only when required fields are filled
  // Additionally, when editing, require that at least one field changed.
  const isEditing = Boolean(caseId);
  const initialClient = routeClient.trim();
  const initialOpp    = routeOpp.trim();
  const initialDetails= routeDetails.trim();

  const requiredOk = clientName.trim() !== '' && oppositePartyName.trim() !== '';
  // Length limits: names <= 50, details <= 200
  const withinLimits =
    clientName.trim().length <= 50 &&
    oppositePartyName.trim().length <= 50 &&
    (caseDetails.trim().length <= 200);
  const isDirty =
    clientName.trim() !== initialClient ||
    oppositePartyName.trim() !== initialOpp ||
    (caseDetails.trim() || '') !== (initialDetails || '');

  const canSubmit = requiredOk && withinLimits && (!isEditing || isDirty);
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressStage, setProgressStage] = useState(0); // 0 saving, 1 syncing, 2 done
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const [nextNav, setNextNav] = useState(null);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    try { impactLight(); } catch {}
    try { Keyboard.dismiss(); } catch {}

    const now = Date.now();
    const payload = {
      id: caseId || uuid.v4(),
      clientName: clientName.trim(),
      oppositePartyName: oppositePartyName.trim(),
      title: `${clientName.trim()} vs ${oppositePartyName.trim()}`,
      details: caseDetails.trim(),
      // Store timestamps as ms epoch
      createdAt: caseId ? undefined : now,
      updatedAt: now,
    };

    const created = !caseId;
    if (caseId) {
      await dispatch(updateCase(payload)).unwrap();
    } else {
      await dispatch(addCase(payload)).unwrap();
      try {
        logGenericEvent('case_created', { source: routeSource || 'unknown' });
      } catch {}
    }
    try { successNotify(); } catch {}

    // Show progress overlay: mark saving done, then sync, then navigate
    setProgressStage(1);
    setProgressVisible(true);
    try { syncIfWatermelon(); } catch {}
    await new Promise((res) => setTimeout(res, 1200));
    setProgressStage(2);
    setAwaitingContinue(true);
    setNextNav(created ? { type: 'case', caseId: payload.id } : { type: 'back' });
  }, [canSubmit, caseId, clientName, oppositePartyName, caseDetails, dispatch, navigation]);

  // Header title + right Save/Update button
  useLayoutEffect(() => {
    navigation.setOptions({
      title: caseId ? 'Edit Case' : 'New Case',
      headerRight: () => (
        <TouchableOpacity
          onPress={onSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          style={{
            marginRight: 16,
            opacity: canSubmit ? 1 : 0.5,
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: colors.accent,
            borderRadius: 18,
          }}
        >
          <Text style={{ color: colors.accentOnAccent, fontSize: 16, fontWeight: '700' }}>
            {caseId ? 'Update' : 'Save'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, caseId, canSubmit, onSubmit]);

  // Track entry point when opening Add Case (create only)
  useEffect(() => {
    if (!caseId) {
      try {
        logGenericEvent('add_case_open', {
          source: routeSource || 'unknown',
        });
      } catch {}
    }
  }, [caseId]);

  // Ads removed for now

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          {/* Client Name */}
          <View style={styles.field}>
            <Text style={styles.label}>
              Client Name<Text style={styles.required}> *</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter client's name"
              placeholderTextColor={colors.placeholder}
              value={clientName}
              onChangeText={setClientName}
              maxLength={50}
            />
          </View>

          {/* Opposite Party Name */}
          <View style={styles.field}>
            <Text style={styles.label}>
              Opposite Party Name<Text style={styles.required}> *</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter opposite party's name"
              placeholderTextColor={colors.placeholder}
              value={oppositePartyName}
              onChangeText={setOppositePartyName}
              maxLength={50}
            />
          </View>

          {/* Case Details */}
          <View style={styles.field}>
            <Text style={styles.label}>Case Details</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Write here..."
              placeholderTextColor={colors.placeholder}
              value={caseDetails}
              onChangeText={setCaseDetails}
              multiline
              textAlignVertical="top"
              maxLength={200}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <SavingSyncOverlay
        visible={progressVisible}
        stage={progressStage}
        showContinue={awaitingContinue}
        continueLabel="Continue"
        onContinue={() => {
          setProgressVisible(false);
          setAwaitingContinue(false);
          const target = nextNav;
          setNextNav(null);
          if (!target) return;
          if (target.type === 'case') navigation.replace('CaseDetail', { caseId: target.caseId });
          else navigation.goBack();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  form: { padding: 16 },
  field: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: colors.textPrimary },
  required: { color: colors.dangerText },
  input: {
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
  },
  textArea: { height: 140 },
});
