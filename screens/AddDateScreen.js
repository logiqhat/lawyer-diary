import React, { useState, useLayoutEffect, useCallback, useRef, useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import uuid from 'react-native-uuid';
import { Ionicons } from '@expo/vector-icons';

import { addDate, updateDate } from '../store/caseDatesSlice';
import { parseYMDLocal, formatHumanDateLong } from '../utils/dateFmt';
import { useUserTimeZone } from '../hooks/useUserTimeZone';
import ActionSheetModal from '../components/ActionSheetModal';
import colors from '../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import SavingSyncOverlay from '../components/SavingSyncOverlay';
import { syncIfWatermelon } from '../services/syncService';
import { impactLight, successNotify } from '../utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../services/apiClient';
import { registerForFcmTokenAsync } from '../services/pushNotificationsFcm';

// helper to format local date as YYYY-MM-DD
const toLocalYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function AddDateScreen() {
  const navigation = useNavigation();
  const { caseId: initialCaseId, dateId, eventDate: routeEventDate } = useRoute().params || {};
  const dispatch = useDispatch();
  const cases = useSelector((state) => state.cases?.items || []);
  const caseDates = useSelector((state) => state.caseDates?.items || []);
  const timeZone = useUserTimeZone();



  // if editing, load the existing date object
  const existingDate = dateId ? caseDates.find((d) => d.id === dateId) : null;

  // Local state (prefilled if editing)
  const [selectedCaseId, setSelectedCaseId] = useState(
    initialCaseId || existingDate?.caseId || ''
  );
  const [showCasePicker, setShowCasePicker] = useState(false);
  const [date, setDate] = useState(
    existingDate
      ? parseYMDLocal(existingDate.eventDate)
      : (routeEventDate ? parseYMDLocal(routeEventDate) : null)
  );
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [notes, setNotes] = useState(existingDate?.notes || '');
  const [photoUri, setPhotoUri] = useState(existingDate?.photoUri || null);
  const [showValidation, setShowValidation] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayStage, setOverlayStage] = useState(0);
  const [overlayErrorText, setOverlayErrorText] = useState('');
  const [pendingEnableNotifPrompt, setPendingEnableNotifPrompt] = useState(false);

  // Derived state
  const selectedCase = cases.find((c) => c.id === selectedCaseId);
  const isEditing = Boolean(existingDate);
  // For updates, keep disabled until something actually changes.
  const originalEventDate = existingDate?.eventDate || null;
  const originalNotes = existingDate?.notes || '';
  const originalPhotoUri = existingDate?.photoUri || null;
  const isDirty = !isEditing || (
    selectedCaseId !== existingDate.caseId ||
    (date ? toLocalYMD(date) : null) !== originalEventDate ||
    (notes || '') !== (originalNotes || '') ||
    (photoUri || null) !== (originalPhotoUri || null)
  );
  const withinLimits = (notes || '').length <= 200;
  const canSave = !!selectedCaseId && !!date && isDirty && withinLimits;

  const handleConfirm = (pickedDate) => {
    setDate(pickedDate);
    setDatePickerVisible(false);
  };

  const caseActions = cases.map((c) => ({
    label: c.title?.trim() || 'Untitled Case',
    onPress: () => setSelectedCaseId(c.id),
  }));

  const notesInputRef = useRef(null);

  // Dismiss the software keyboard when saving/sync overlay is visible
  useEffect(() => {
    if (!overlayVisible) return;
    try { notesInputRef.current?.blur?.(); } catch {}
    try { Keyboard.dismiss(); } catch {}
  }, [overlayVisible]);

  const saveDate = useCallback(() => {
    const eventDate = toLocalYMD(date);
    const now = Date.now();
    if (existingDate) {
      dispatch(
        updateDate({
          ...existingDate,
          caseId: selectedCaseId,
          eventDate,
          notes,
          photoUri,
          // Store timestamps as ms epoch
          updatedAt: now,
        })
      );
      // no-op; handled by overlay
    } else {
      dispatch(
        addDate({
          id: uuid.v4(),
          caseId: selectedCaseId,
          eventDate,
          notes,
          photoUri,
          // Store timestamps as ms epoch
          createdAt: now,
        })
      );
      // If this becomes the second date overall and notifications are off, queue prompt.
      (async () => {
        try {
          const pref = await AsyncStorage.getItem('settings:notifyEnabled');
          const enabled = pref === 'true';
          if (!enabled && (caseDates?.length || 0) === 1) {
            setPendingEnableNotifPrompt(true);
          }
        } catch {}
      })();
      // no-op; handled by overlay
    }
    // Show overlay with staged animations and sync
    try { successNotify(); } catch {}
    setOverlayVisible(true);
    setOverlayStage(0);
    // Progress to "saving done" quickly for visual feedback (monotonic)
    setTimeout(() => setOverlayStage((s) => Math.max(s, 1)), 600);

    // Robust offline check helper (expo-network if available, else navigator.onLine)
    const checkOffline = async () => {
      try {
        // eslint-disable-next-line global-require
        const Network = require('expo-network');
        const st = await Network.getNetworkStateAsync();
        if (st && (st.isInternetReachable === false || st.isConnected === false)) return true;
      } catch (e) {}
      try {
        // eslint-disable-next-line no-undef
        if (typeof navigator !== 'undefined' && navigator?.onLine === false) return true;
      } catch (e) {}
      return false;
    };

    // Start sync with offline handling and timeout
    (async () => {
      if (await checkOffline()) {
        setOverlayErrorText('Syncing with cloud failed: Not connected to Internet');
        setOverlayStage(2);
        return;
      }

      let done = false;
      const to = setTimeout(async () => {
        if (!done) {
          if (await checkOffline()) {
            setOverlayErrorText('Syncing with cloud failed: Not connected to Internet');
          }
          setOverlayStage(2);
        }
      }, 4000);

      try { await syncIfWatermelon(); } catch (e) { console.warn('Sync after save failed:', e?.message || e); }
      done = true;
      try { clearTimeout(to); } catch (e) {}
      setOverlayStage(2);
    })();
  }, [date, dispatch, existingDate, navigation, notes, photoUri, selectedCaseId]);

  const onSubmit = useCallback(() => {
    setShowValidation(true);
    if (!canSave) return;
    try { impactLight(); } catch {}
    if (!date) {
      Alert.alert('Missing Date', 'Please select a date before saving.');
      return;
    }
    const noNotes = !String(notes || '').trim();
    const noPhoto = !photoUri;
    if (noNotes && noPhoto) {
      Alert.alert(
        'Add details?',
        'A quick note or photo helps you remember context later.',
        [
          { text: 'Add Photo', onPress: () => handleCapturePhoto() },
          { text: 'Add Note', onPress: () => notesInputRef.current?.focus() },
          { text: 'Save Anyway', style: 'default', onPress: () => saveDate() },
        ]
      );
      return;
    }
    saveDate();
  }, [canSave, date, notes, photoUri, saveDate]);

  // Put Save/Update button in the header (top-right)
  useLayoutEffect(() => {
    const saveButton = () => (
      <TouchableOpacity
        onPress={onSubmit}
        disabled={!canSave}
        accessibilityRole="button"
        style={{
          marginRight: 16,
          opacity: canSave ? 1 : 0.5,
          paddingHorizontal: 10,
          paddingVertical: 4,
          backgroundColor: colors.accent,
          borderRadius: 18,
        }}
      >
        <Text style={{ color: colors.accentOnAccent, fontSize: 16, fontWeight: '700' }}>
          {existingDate ? 'Update' : 'Save'}
        </Text>
      </TouchableOpacity>
    )

    navigation.setOptions({
      title: existingDate ? 'Edit Date' : 'Add Date',
      headerLeft: overlayVisible ? () => null : undefined,
      headerRight: overlayVisible ? () => null : saveButton,
      gestureEnabled: !overlayVisible,
    })
  }, [navigation, onSubmit, canSave, existingDate, overlayVisible]);

  // Request permissions; do not block camera if photo library is denied.
  const requestPermissions = async () => {
    try {
      const camera = await ImagePicker.requestCameraPermissionsAsync();
      const canUseCamera = camera.status === 'granted';
      if (!canUseCamera) {
        Alert.alert('Camera Access Needed', 'Please allow camera access to take a photo.');
        return { canUseCamera: false, canSaveToPhotos: false };
      }

      // Request add-only media library permission for saving to Photos (non-blocking)
      let canSaveToPhotos = false;
      try {
        const media = await ImagePicker.requestMediaLibraryPermissionsAsync(true);
        canSaveToPhotos = media.status === 'granted';
      } catch (e) {
        console.warn('Media library permission request failed:', e);
      }

      return { canUseCamera: true, canSaveToPhotos };
    } catch (e) {
      console.warn('Permission flow failed:', e);
      Alert.alert('Permissions Error', 'Could not request required permissions.');
      return { canUseCamera: false, canSaveToPhotos: false };
    }
  };

  const handleCapturePhoto = async () => {
    const { canUseCamera, canSaveToPhotos } = await requestPermissions();
    if (!canUseCamera) return;
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.8,
        saveToPhotos: !!canSaveToPhotos,
      });
      if (!result.canceled && result.assets?.length) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Camera Error', 'We could not open the camera. Please try again.');
      console.warn('Camera capture failed', error);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUri(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          {/* Case selector */}
          <View style={styles.field}>
            <Text style={styles.label}>
              Case<Text style={styles.required}> *</Text>
            </Text>
            <TouchableOpacity
              style={[
                styles.selectorButton,
                !selectedCaseId && showValidation ? styles.selectorError : null,
              ]}
              onPress={() => setShowCasePicker(true)}
            >
              <Text
                style={
                  selectedCase ? styles.selectorText : styles.placeholderText
                }
              >
                {selectedCase ? selectedCase.title : 'Select a case'}
              </Text>
            </TouchableOpacity>
            {!selectedCaseId && showValidation && (
              <Text style={styles.hint}>Please select a case</Text>
            )}

            {/* Modal for case selection */}
            <ActionSheetModal
              visible={showCasePicker}
              onClose={() => setShowCasePicker(false)}
              title="Select a Case"
              actions={caseActions}
              showCancelButton={false}
              footerButtons={[
                {
                  label: 'Add Case',
                  variant: 'primary',
                  onPress: () => navigation.navigate('CreateCase'),
                },
                {
                  label: 'Close',
                  variant: 'neutral',
                },
              ]}
            />
          </View>

          {/* Date selector */}
          <View style={styles.field}>
              <Text style={styles.label}>
                Date<Text style={styles.required}> *</Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.selectorButton,
                  !date && showValidation ? styles.selectorError : null,
                ]}
                onPress={() => setDatePickerVisible(true)}
              >
                {date ? (
                  <Text style={styles.selectorText}>
                    {formatHumanDateLong(date, { weekday: undefined, timeZone })}
                  </Text>
                ) : (
                  <Text style={styles.placeholderText}>Select a date</Text>
                )}
              </TouchableOpacity>
              {!date && showValidation && (
                <Text style={styles.hint}>Please select a date</Text>
              )}
              <DateTimePickerModal
                isVisible={isDatePickerVisible}
                mode="date"
                // Use spinner on iOS for better contrast and predictable colors
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                isDarkModeEnabled={false}
                themeVariant="light"
                textColor={colors.textDark}
                date={date || new Date()}
                onConfirm={handleConfirm}
                onCancel={() => setDatePickerVisible(false)}
                minimumDate={new Date(2000, 0, 1)}
                maximumDate={new Date(2100, 11, 31)}
                {...(Platform.OS === 'android'
                  ? { title: 'Select date' }
                  : {})}
              />
          </View>

          {/* Notes */}
          <View style={styles.field}>
            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Any additional details you want to remember, like court location, documents to bring, etc."
              placeholderTextColor={colors.placeholder}
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
              maxLength={200}
              ref={notesInputRef}
            />
          </View>

          {/* Photo attachment */}
          <View style={styles.field}>
            <Text style={styles.label}>Photo (optional)</Text>
            {photoUri ? (
              <View style={styles.photoPreviewWrapper}>
                <TouchableOpacity
                  onPress={handleCapturePhoto}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Replace photo"
                >
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.removePhotoBtn} onPress={handleRemovePhoto}>
                  <Ionicons name="trash-outline" size={18} color={colors.primary} />
                  <Text style={styles.removePhotoLabel}>Remove Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.photoPlaceholder}
                onPress={handleCapturePhoto}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Capture photo"
              >
                <Ionicons name="camera-outline" size={28} color={colors.iconSubtle} />
                <Text style={styles.photoPlaceholderLabel}>Tap to add a photo</Text>
                <Text style={styles.photoTipLabel}>Summons, orders, receipts — anything you’ll need later</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <SavingSyncOverlay
        visible={overlayVisible}
        stage={overlayStage}
        errorText={overlayErrorText}
        onContinue={() => {
          setOverlayVisible(false);
          setOverlayErrorText('');
          // After save complete, optionally prompt to enable notifications (on 2nd date added)
          if (pendingEnableNotifPrompt) {
            setPendingEnableNotifPrompt(false);
            Alert.alert(
              'Turn on reminders?',
              'Enable push notifications to get reminders about upcoming dates.',
              [
                {
                  text: 'Not now',
                  style: 'cancel',
                  onPress: () => {
                    navigation.dispatch(
                      CommonActions.reset({
                        index: 1,
                        routes: [
                          { name: 'MainTabs' },
                          { name: 'CaseDetail', params: { caseId: selectedCaseId } },
                        ],
                      })
                    );
                  },
                },
                {
                  text: 'Enable',
                  style: 'default',
                  onPress: async () => {
                    try { await AsyncStorage.setItem('settings:notifyEnabled', 'true'); } catch {}
                    try {
                      const token = await registerForFcmTokenAsync();
                      await apiClient.post('/users', {
                        body: { notifyEnabled: true, ...(token ? { fcmToken: token } : {}) },
                      });
                    } catch (e) {
                      console.warn('Enable notifications failed', e?.message || e);
                    }
                    navigation.dispatch(
                      CommonActions.reset({
                        index: 1,
                        routes: [
                          { name: 'MainTabs' },
                          { name: 'CaseDetail', params: { caseId: selectedCaseId } },
                        ],
                      })
                    );
                  },
                },
              ]
            );
          } else {
            navigation.dispatch(
              CommonActions.reset({
                index: 1,
                routes: [
                  { name: 'MainTabs' },
                  { name: 'CaseDetail', params: { caseId: selectedCaseId } },
                ],
              })
            );
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  form: { padding: 16 },
  field: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
  required: { color: colors.dangerText },

  selectorButton: {
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  selectorError: {
    borderWidth: 1,
    borderColor: colors.dangerText,
  },
  selectorText: { fontSize: 16, color: colors.textDark },
  placeholderText: { fontSize: 16, color: colors.placeholder },
  hint: { marginTop: 6, color: colors.dangerText, fontSize: 12 },

  modalOverlay: { flex: 1, backgroundColor: colors.overlayStrong },
  modalContentCenter: {
    alignSelf: 'center',
    width: '80%',
    backgroundColor: colors.surface,
    borderRadius: 10,
    maxHeight: '50%',
  },
  modalItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalItemText: { fontSize: 16, color: colors.textDark },

  input: {
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: colors.textDark,
  },
  textArea: { height: 120 },
  photoPreviewWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: colors.surfaceMuted,
  },
  photoPreview: {
    width: '100%',
    height: 180,
  },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  removePhotoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  photoPlaceholder: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: 160,
    marginBottom: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accent,
  },
  photoPlaceholderLabel: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 14,
  },
  photoTipLabel: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 12,
  },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  captureButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primaryOnPrimary,
  },
});
