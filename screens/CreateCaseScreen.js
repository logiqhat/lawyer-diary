// src/screens/CreateCaseScreen.js
import React, { useState, useLayoutEffect, useCallback } from 'react';
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
} from 'react-native';
import { useDispatch } from 'react-redux';
import { useNavigation, useRoute } from '@react-navigation/native';
import uuid from 'react-native-uuid';

import { addCase, updateCase } from '../store/casesSlice';
import colors from '../theme/colors';
import { impactLight, successNotify } from '../utils/haptics';

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

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    try { impactLight(); } catch {}

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

    if (caseId) {
      await dispatch(updateCase(payload)).unwrap();
      try { successNotify(); } catch {}
      navigation.goBack(); // back to detail
    } else {
      await dispatch(addCase(payload)).unwrap();
      try { successNotify(); } catch {}
      // Go straight to the new case details and replace the Create screen
      navigation.replace('CaseDetail', { caseId: payload.id });
    }
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
