// Banner create / edit screen — admin uploads / replaces a home-screen
// banner image, sets its name + active flag. Save action is the word
// "Save" in the top-right of the header (matches UserDetails).
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import Toast from 'react-native-toast-message';
import { MaterialIcons } from '@expo/vector-icons';
import Text from '@components/Text';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TextInput as FormInput } from '@components/common/TextInput';
import ConfirmModal from '@components/Modal/ConfirmModal';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import {
  createAppBannerOdoo,
  updateAppBannerOdoo,
  deleteAppBannerOdoo,
  fetchAppBannerByIdOdoo,
} from '@api/services/generalApi';
import { useFeatureHidden, FeatureGate } from '@components/FeatureGate';

const NAVY = COLORS.primaryThemeColor;
const MUTED = '#8896ab';
const SOFT_BG = '#F5F6FA';

const BannerDetailsScreen = ({ navigation, route }) => {
  const mode = route?.params?.mode === 'edit' ? 'edit' : 'create';
  const seedBanner = route?.params?.banner || null;
  const bannerId = seedBanner?.id || null;
  // Defense-in-depth: mode-aware Save gate.
  const saveOpHidden = useFeatureHidden(mode === 'edit' ? 'app_banners.edit' : 'app_banners.add');

  const [bootstrapping, setBootstrapping] = useState(mode === 'edit' && !!bannerId);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  const [form, setForm] = useState({
    name: seedBanner?.name || '',
    active: seedBanner?.active !== false,
    image: seedBanner?.image || null,           // base64 string, no `data:` prefix
    image_filename: seedBanner?.image_filename || '',
    imageDirty: false,                           // only re-upload bytes when the user picked a new image
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    console.log(`[AppBanner] detail mount mode=${mode}, bannerId=${bannerId}`);
  }, []);

  // Edit mode: pull the full record from Odoo so the form has the
  // latest base64 (the list helper drops it for non-active rows).
  useFocusEffect(
    useCallback(() => {
      if (mode !== 'edit' || !bannerId) return;
      let alive = true;
      (async () => {
        const row = await fetchAppBannerByIdOdoo(bannerId);
        if (!alive) return;
        if (row) {
          const imgKB = row.image ? Math.round(row.image.length / 1024) : 0;
          console.log(`[AppBanner] detail bootstrap loaded, name="${row.name}", imageKB=${imgKB}`);
          setForm((p) => ({
            ...p,
            name: row.name || p.name,
            active: row.active !== false,
            image: row.image || p.image,
            image_filename: row.image_filename || '',
            imageDirty: false,
          }));
        } else {
          console.warn('[AppBanner] detail bootstrap returned null');
        }
        setBootstrapping(false);
      })();
      return () => { alive = false; };
    }, [mode, bannerId])
  );

  const setField = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  // Gallery picker — disk-roundtrip read avoids the RN-bridge OOM that
  // hits when ImagePicker streams base64 directly. `allowsEditing: true`
  // + `aspect: [16, 9]` tells the OS to show its native crop / select-
  // area step right after the user picks a photo, so the cashier can
  // pre-frame the banner before it's saved (mirrors the
  // employee_attendance BannerManagement flow).
  const pickFromGallery = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Toast.show({
          type: 'error',
          text1: 'Gallery access denied',
          text2: 'Enable gallery permission in Settings to pick a banner.',
          position: 'bottom',
        });
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        // Match the Home carousel card's 3:1 aspect so what the admin
        // crops is exactly what users see on Home (no cover-crop loss).
        aspect: [3, 1],
        exif: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) {
        Toast.show({ type: 'error', text1: 'Pick failed', text2: 'No image data', position: 'bottom' });
        return;
      }
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const nameGuess = asset.fileName || asset.uri.split('/').pop() || 'banner.jpg';
      const imgKB = Math.round(base64.length / 1024);
      console.log(`[AppBanner] image picked, filename="${nameGuess}", sizeKB=${imgKB}`);
      setForm((p) => ({
        ...p,
        image: base64,
        image_filename: nameGuess,
        imageDirty: true,
      }));
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Pick failed', text2: e?.message || '', position: 'bottom' });
    } finally {
      setPicking(false);
    }
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.image) next.image = 'Pick an image';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      Toast.show({ type: 'error', text1: 'Fill the required details', position: 'bottom' });
      return;
    }
    console.log(`[AppBanner] save start, mode=${mode}, bannerId=${bannerId}, imageDirty=${form.imageDirty}`);
    setSaving(true);
    try {
      let result;
      if (mode === 'create') {
        result = await createAppBannerOdoo({
          name: form.name.trim(),
          image: form.image,
          image_filename: form.image_filename || 'banner.jpg',
          sequence: 10,
          active: form.active,
        });
      } else {
        const payload = {
          id: bannerId,
          name: form.name.trim(),
          sequence: 10,
          active: form.active,
        };
        // Only ship the new bytes when the user actually picked something.
        if (form.imageDirty && form.image) {
          payload.image = form.image;
          payload.image_filename = form.image_filename || 'banner.jpg';
        }
        result = await updateAppBannerOdoo(payload);
      }
      if (result?.error) {
        const msg = result.error?.data?.message || result.error?.message || 'Odoo rejected the request';
        console.warn(`[AppBanner] save failed, mode=${mode}, msg=`, msg);
        Toast.show({
          type: 'error',
          text1: mode === 'create' ? 'Create failed' : 'Update failed',
          text2: msg,
          position: 'bottom',
        });
        return;
      }
      console.log(`[AppBanner] save done, mode=${mode}, ok=true`);
      Toast.show({
        type: 'success',
        text1: mode === 'create' ? 'Banner created' : 'Banner updated',
        position: 'bottom',
      });
      navigation.goBack();
    } catch (e) {
      console.error('[AppBanner] save threw:', e?.message || e);
      Toast.show({
        type: 'error',
        text1: 'Save failed',
        text2: e?.message || '',
        position: 'bottom',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => setDeleteConfirmVisible(true);

  const performDelete = async () => {
    setDeleteConfirmVisible(false);
    console.log(`[AppBanner] delete start, id=${bannerId}`);
    setDeleting(true);
    try {
      const res = await deleteAppBannerOdoo(bannerId);
      if (res?.error) {
        const msg = res.error?.data?.message || res.error?.message || '';
        console.warn('[AppBanner] delete failed:', msg);
        Toast.show({
          type: 'error',
          text1: 'Delete failed',
          text2: msg,
          position: 'bottom',
        });
        return;
      }
      console.log(`[AppBanner] delete done, id=${bannerId}, ok=true`);
      Toast.show({ type: 'success', text1: 'Banner deleted', position: 'bottom' });
      navigation.goBack();
    } finally {
      setDeleting(false);
    }
  };

  const SectionHeader = ({ icon, children }) => (
    <View style={styles.sectionHeaderRow}>
      <MaterialIcons name={icon} size={16} color={NAVY} />
      <Text style={styles.sectionHeader}>{children}</Text>
    </View>
  );

  if (bootstrapping) {
    return (
      <SafeAreaView backgroundColor={SOFT_BG}>
        <NavigationHeader title="Edit Banner" onBackPress={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView backgroundColor={SOFT_BG}>
      <NavigationHeader
        title={mode === 'edit' ? 'Edit Banner' : 'Create Banner'}
        onBackPress={() => navigation.goBack()}
        saveLabel={saveOpHidden ? undefined : (saving ? 'Saving…' : 'Save')}
        onSavePress={saveOpHidden ? undefined : (saving ? () => {} : handleSave)}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* DETAILS */}
          <SectionHeader icon="info-outline">DETAILS</SectionHeader>
          <View style={styles.card}>
            <FormInput
              label="Name"
              placeholder="e.g. Summer Sale"
              value={form.name}
              onChangeText={(t) => setField('name', t)}
              error={errors.name}
              required
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Active</Text>
              <Switch
                value={form.active}
                onValueChange={(v) => setField('active', v)}
                trackColor={{ false: '#D1D5DB', true: NAVY }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* IMAGE */}
          <SectionHeader icon="image">IMAGE</SectionHeader>
          <View style={styles.card}>
            {form.image ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${form.image}` }}
                style={styles.preview}
              />
            ) : (
              <View style={[styles.preview, styles.previewEmpty]}>
                <MaterialIcons name="image" size={36} color={MUTED} />
                <Text style={styles.previewEmptyText}>No image yet</Text>
              </View>
            )}
            {errors.image ? <Text style={styles.errorText}>{errors.image}</Text> : null}
            <TouchableOpacity
              style={[styles.pickBtn, picking && { opacity: 0.6 }]}
              onPress={pickFromGallery}
              disabled={picking}
              activeOpacity={0.85}
            >
              <MaterialIcons
                name={mode === 'edit' && form.image ? 'cached' : 'photo-library'}
                size={18}
                color="#fff"
              />
              <Text style={styles.pickBtnText}>
                {picking
                  ? 'Loading…'
                  : mode === 'edit' && form.image
                    ? 'Replace image'
                    : 'Pick from gallery'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* DELETE — edit mode only */}
          {mode === 'edit' ? (
            <FeatureGate featureKey="app_banners.delete">
              <TouchableOpacity
                style={[styles.deleteBtn, deleting && { opacity: 0.6 }]}
                onPress={handleDelete}
                disabled={deleting}
                activeOpacity={0.85}
              >
                <MaterialIcons name="delete-outline" size={18} color="#DC2626" />
                <Text style={styles.deleteBtnText}>
                  {deleting ? 'Deleting…' : 'Delete banner'}
                </Text>
              </TouchableOpacity>
            </FeatureGate>
          ) : null}

          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator color={NAVY} size="small" />
              <Text style={styles.savingText}>Saving…</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        isVisible={deleteConfirmVisible}
        title="Delete banner?"
        message="This permanently removes the banner from the carousel."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={performDelete}
        onCancel={() => setDeleteConfirmVisible(false)}
      />
    </SafeAreaView>
  );
};

export default BannerDetailsScreen;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 14, paddingBottom: 60 },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 8,
    marginLeft: 4, gap: 6,
  },
  sectionHeader: {
    fontSize: 12, color: NAVY, letterSpacing: 0.6, fontFamily: FONT_FAMILY.urbanistBold,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
  },
  switchLabel: { fontSize: 16, color: NAVY, fontFamily: FONT_FAMILY.urbanistSemiBold },
  preview: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: '#000',
    resizeMode: 'cover',
  },
  previewEmpty: {
    backgroundColor: '#F1F2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmptyText: {
    color: MUTED, fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 6, fontSize: 12,
  },
  errorText: {
    color: COLORS.red, fontSize: 12, marginTop: 6, fontFamily: FONT_FAMILY.urbanistMedium,
  },
  pickBtn: {
    marginTop: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: NAVY,
    borderRadius: 10, paddingVertical: 12, gap: 6,
  },
  pickBtnText: {
    color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, letterSpacing: 0.4,
  },
  deleteBtn: {
    marginTop: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.2, borderColor: '#DC2626',
    borderRadius: 10, paddingVertical: 12, gap: 6,
  },
  deleteBtnText: {
    color: '#DC2626', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, letterSpacing: 0.4,
  },
  savingRow: {
    marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  savingText: { color: NAVY, fontFamily: FONT_FAMILY.urbanistBold, fontSize: 13 },
});
