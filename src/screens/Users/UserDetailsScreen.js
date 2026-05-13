// User create / edit screen — mirrors Odoo's Settings → Users form.
// Three sections (Personal Details, Access Rights, Security), one
// scrollable page. Access-Rights uses Odoo-style label-on-left /
// value-on-right rows: each row shows the *current value* (e.g.
// "Advisor", "Administrator", or "No"). Tapping a row opens a centred
// popup (NOT a bottom-sheet) — this keeps the picker visible without
// the keyboard / nav-bar fighting for space, which the cashiers asked
// for after the previous bottom-sheet iteration.
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { MaterialIcons } from '@expo/vector-icons';
import Text from '@components/Text';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TextInput as FormInput } from '@components/common/TextInput';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import {
  createUserOdoo,
  updateUserOdoo,
  updateUserPasswordOdoo,
  fetchUserDetailsOdoo,
  fetchGroupCategoriesOdoo,
  fetchCompaniesOdoo,
} from '@api/services/generalApi';
import { useFeatureHidden, FeatureGate } from '@components/FeatureGate';

const NAVY = COLORS.primaryThemeColor;
const MUTED = '#8896ab';
const SOFT_BG = '#F5F6FA';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const POPUP_MAX_HEIGHT = Math.min(SCREEN_HEIGHT * 0.62, 480);

// Centred modal picker — single OR multi select (when `multi` is true).
// Backdrop tap closes. Card stays in the middle of the screen so the
// cashier doesn't have to squint at the bottom edge.
const CenterPickerModal = ({
  visible,
  title,
  items,
  multi = false,
  selectedId = null,
  selectedIds,
  onSelect,        // (id)        — single-select
  onConfirm,       // (ids[])     — multi-select Done
  onClose,
}) => {
  // The parent mounts/unmounts this component when openSheet changes,
  // so the initial state from props is correct — no syncing useEffect
  // needed (and adding one with `selectedIds` in deps caused an
  // infinite loop when the default `= []` produced a fresh array
  // reference every render).
  const [tempIds, setTempIds] = useState(() => Array.isArray(selectedIds) ? selectedIds : []);

  const toggle = (id) => {
    setTempIds((prev) => {
      const exists = prev.includes(id);
      return exists ? prev.filter((x) => x !== id) : [...prev, id];
    });
  };

  const renderItem = ({ item }) => {
    const isSelected = multi
      ? tempIds.includes(item.id)
      : selectedId === item.id || (selectedId == null && item.id == null);
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={[popupStyles.row, isSelected && popupStyles.rowOn]}
        onPress={() => {
          if (multi) toggle(item.id);
          else { onSelect(item); onClose(); }
        }}
      >
        {multi ? (
          <MaterialIcons
            name={isSelected ? 'check-box' : 'check-box-outline-blank'}
            size={22}
            color={isSelected ? NAVY : '#9CA3AF'}
            style={{ marginRight: 10 }}
          />
        ) : null}
        <Text style={[popupStyles.rowText, isSelected && popupStyles.rowTextOn]} numberOfLines={1}>
          {item.label}
        </Text>
        {!multi && isSelected ? (
          <MaterialIcons name="check" size={20} color={NAVY} style={{ marginLeft: 8 }} />
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={popupStyles.backdrop}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={popupStyles.card}>
          <View style={popupStyles.header}>
            <Text style={popupStyles.title} numberOfLines={1}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={22} color={NAVY} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={items}
            keyExtractor={(it, idx) => `opt-${it.id ?? 'none'}-${idx}`}
            renderItem={renderItem}
            style={{ maxHeight: POPUP_MAX_HEIGHT - 110 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
          {multi ? (
            <View style={popupStyles.footer}>
              <TouchableOpacity style={popupStyles.cancelBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={popupStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={popupStyles.doneBtn}
                onPress={() => { onConfirm(tempIds); onClose(); }}
                activeOpacity={0.85}
              >
                <Text style={popupStyles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

// Odoo-style row: label on the left, current value on the right with a
// dropdown chevron. Whole row taps to open whatever picker the parent
// passes through `onPress`.
const PickerRow = ({ label, value, onPress, last }) => {
  const isUnset = !value || value === 'No';
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.pickerRow, last && { borderBottomWidth: 0 }]}
    >
      <Text style={styles.pickerLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.pickerValueWrap}>
        <Text
          style={[styles.pickerValue, isUnset && styles.pickerValueUnset]}
          numberOfLines={1}
        >
          {value || 'No'}
        </Text>
        <MaterialIcons name="keyboard-arrow-down" size={20} color={NAVY} />
      </View>
    </TouchableOpacity>
  );
};

const UserDetailsScreen = ({ navigation, route }) => {
  const mode = route?.params?.mode === 'edit' ? 'edit' : 'create';
  const seedUser = route?.params?.user || null;
  const userId = seedUser?.id || null;
  // Defense-in-depth: mode-aware Save gate.
  const saveOpHidden = useFeatureHidden(mode === 'edit' ? 'users.edit' : 'users.add');

  const [bootstrapping, setBootstrapping] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  const [companies, setCompanies] = useState([]);
  const [sections, setSections] = useState([]);          // [{ id, name, leaves }]
  const [adminCategory, setAdminCategory] = useState(null); // { id, settingsGroupId } | null

  const [form, setForm] = useState({
    name: seedUser?.name || '',
    login: seedUser?.login || '',
    password: '',
    email: seedUser?.email || '',
    phone: seedUser?.phone || '',
    companyIds: [],
    defaultCompanyId: null,
    groupByCategory: {},
  });
  const [errors, setErrors] = useState({});

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Single open-sheet tracker — 'companies' / 'defaultCompany' / `cat:<id>` / null.
  const [openSheet, setOpenSheet] = useState(null);

  // ─── bootstrap ──────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [comps, catsResult, details] = await Promise.all([
          fetchCompaniesOdoo(),
          fetchGroupCategoriesOdoo(),
          mode === 'edit' && userId ? fetchUserDetailsOdoo(userId) : Promise.resolve(null),
        ]);
        if (!alive) return;
        const sectionsList = catsResult?.sections || [];
        const admin = catsResult?.adminCategory || null;
        setCompanies(Array.isArray(comps) ? comps : []);
        setSections(sectionsList);
        setAdminCategory(admin);

        if (details) {
          const userGroupIds = new Set(details.groups_id || []);
          const byCat = {};
          for (const sec of sectionsList) {
            for (const lf of (sec.leaves || [])) {
              const hit = (lf.groups || []).find((g) => userGroupIds.has(g.id));
              byCat[lf.id] = hit ? hit.id : null;
            }
          }
          // Pre-fill the Role radio from the user's existing membership
          // in base.group_system (Odoo 19 path — admin lives outside any
          // section, so we key it under the synthetic adminCategory.id).
          if (admin && userGroupIds.has(admin.settingsGroupId)) {
            byCat[admin.id] = admin.settingsGroupId;
          }
          const defaultCompanyId = Array.isArray(details.company_id)
            ? details.company_id[0]
            : details.company_id || null;
          setForm((p) => ({
            ...p,
            name: details.name || p.name,
            login: details.login || p.login,
            email: details.email || '',
            phone: details.phone || '',
            companyIds: Array.isArray(details.company_ids) ? details.company_ids : [],
            defaultCompanyId,
            groupByCategory: byCat,
          }));
        }
      } catch (e) {
        console.warn('[USER DETAIL] bootstrap failed', e);
      } finally {
        if (alive) setBootstrapping(false);
      }
    })();
    return () => { alive = false; };
  }, [mode, userId]);

  // Role radio is bound to the Administration category's "Settings" group.
  // Admin = that group selected; User = nothing selected for that category.
  const isAdminRole = adminCategory
    ? form.groupByCategory[adminCategory.id] === adminCategory.settingsGroupId
    : false;
  const setRole = (admin) => {
    if (!adminCategory) return;
    setForm((p) => ({
      ...p,
      groupByCategory: {
        ...p.groupByCategory,
        [adminCategory.id]: admin ? adminCategory.settingsGroupId : null,
      },
    }));
  };

  const setField = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const companyById = useMemo(() => {
    const m = new Map();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  // Display strings for the picker rows
  const companiesLabel = (form.companyIds || [])
    .map((id) => companyById.get(id)?.name)
    .filter(Boolean)
    .join(', ');
  const defaultCompanyName = form.defaultCompanyId
    ? (companyById.get(form.defaultCompanyId)?.name || '')
    : '';
  // Flat lookup map across all section leaves.
  const leafById = useMemo(() => {
    const m = new Map();
    for (const sec of sections) {
      for (const lf of (sec.leaves || [])) m.set(lf.id, lf);
    }
    return m;
  }, [sections]);
  const groupNameForCategory = (catId) => {
    const lf = leafById.get(catId);
    if (!lf) return '';
    const gid = form.groupByCategory[catId];
    if (!gid) return '';
    return lf.groups.find((g) => g.id === gid)?.name || '';
  };

  // ─── validation + save ──────────────────────────────────────────────────
  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.login.trim()) next.login = 'Login is required';
    if (mode === 'create' && !form.password.trim()) {
      next.password = 'Password is required';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const collectGroupIds = () => Object.values(form.groupByCategory).filter(Boolean);

  const handleSave = async () => {
    if (!validate()) {
      Toast.show({ type: 'error', text1: 'Fill the required details', position: 'bottom' });
      return;
    }
    setSaving(true);
    try {
      const groupIds = collectGroupIds();
      const companyIds = (() => {
        const base = Array.isArray(form.companyIds) ? [...form.companyIds] : [];
        if (form.defaultCompanyId && !base.includes(form.defaultCompanyId)) {
          base.push(form.defaultCompanyId);
        }
        return base;
      })();

      let result;
      if (mode === 'create') {
        result = await createUserOdoo({
          name: form.name.trim(),
          login: form.login.trim(),
          password: form.password,
          email: form.email.trim(),
          phone: form.phone.trim(),
          groups: groupIds,
          companyIds: companyIds.length ? companyIds : undefined,
          defaultCompanyId: form.defaultCompanyId || undefined,
        });
      } else {
        result = await updateUserOdoo({
          userId,
          name: form.name.trim(),
          login: form.login.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          companyIds,
          defaultCompanyId: form.defaultCompanyId,
          groupIds,
        });
      }

      if (result?.error) {
        Toast.show({
          type: 'error',
          text1: mode === 'create' ? 'Create failed' : 'Update failed',
          text2: result.error?.data?.message || result.error?.message || 'Odoo rejected the request',
          position: 'bottom',
        });
        return;
      }
      Toast.show({
        type: 'success',
        text1: mode === 'create' ? 'User created' : 'User updated',
        position: 'bottom',
      });
      navigation.goBack();
    } catch (e) {
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

  const handleChangePassword = async () => {
    if (!newPassword) {
      Toast.show({ type: 'error', text1: 'Enter a new password', position: 'bottom' });
      return;
    }
    if (newPassword !== confirmPassword) {
      Toast.show({ type: 'error', text1: 'Passwords do not match', position: 'bottom' });
      return;
    }
    setChangingPwd(true);
    try {
      const res = await updateUserPasswordOdoo(userId, newPassword);
      if (res?.error) {
        Toast.show({
          type: 'error',
          text1: 'Change failed',
          text2: res.error?.data?.message || res.error?.message || '',
          position: 'bottom',
        });
        return;
      }
      setNewPassword('');
      setConfirmPassword('');
      Toast.show({ type: 'success', text1: 'Password updated', position: 'bottom' });
    } finally {
      setChangingPwd(false);
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
        <NavigationHeader
          title={mode === 'edit' ? 'Edit User' : 'Create User'}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      </SafeAreaView>
    );
  }

  // Items for the popups
  const companyItems = companies.map((c) => ({ id: c.id, label: c.name }));
  const defaultCompanyItems = [{ id: null, label: 'No' }, ...companyItems];
  const openCat = (() => {
    if (!openSheet || !openSheet.startsWith('cat:')) return null;
    const id = Number(openSheet.split(':')[1]);
    return leafById.get(id) || null;
  })();
  const catItems = openCat
    ? [{ id: null, label: 'No' }, ...openCat.groups.map((g) => ({ id: g.id, label: g.name }))]
    : [];

  // Hide the Administration leaf from regular sections — it's promoted
  // to the Role radio at the top.
  const visibleSections = sections
    .map((sec) => ({
      ...sec,
      leaves: (sec.leaves || []).filter((lf) => !adminCategory || lf.id !== adminCategory.id),
    }))
    .filter((sec) => sec.leaves.length > 0);

  return (
    <SafeAreaView backgroundColor={SOFT_BG}>
      <View style={{ flex: 1 }}>
        <NavigationHeader
          title={mode === 'edit' ? 'Edit User' : 'Create User'}
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
            {/* PERSONAL DETAILS */}
            <SectionHeader icon="person">PERSONAL DETAILS</SectionHeader>
            <View style={styles.card}>
              <FormInput
                label="Name"
                placeholder="e.g. John Doe"
                value={form.name}
                onChangeText={(t) => setField('name', t)}
                error={errors.name}
                required
              />
              <FormInput
                label="Login"
                placeholder="username or email"
                value={form.login}
                onChangeText={(t) => setField('login', t)}
                error={errors.login}
                autoCapitalize="none"
                required
              />
              {mode === 'create' ? (
                <FormInput
                  label="Password"
                  placeholder="Initial password"
                  value={form.password}
                  onChangeText={(t) => setField('password', t)}
                  error={errors.password}
                  password
                  required
                />
              ) : null}
              <FormInput
                label="Email"
                placeholder="name@example.com"
                value={form.email}
                onChangeText={(t) => setField('email', t)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <FormInput
                label="Phone"
                placeholder="Phone number"
                value={form.phone}
                onChangeText={(t) => setField('phone', t)}
                keyboardType="phone-pad"
              />
            </View>

            {/* ROLES — Role radio + Companies + Default Company */}
            <SectionHeader icon="badge">ROLES</SectionHeader>
            <View style={styles.card}>
              {adminCategory ? (
                <View style={styles.roleRow}>
                  <Text style={styles.pickerLabel}>Role</Text>
                  <View style={styles.roleOptions}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.radioRow}
                      onPress={() => setRole(false)}
                    >
                      <MaterialIcons
                        name={isAdminRole ? 'radio-button-unchecked' : 'radio-button-checked'}
                        size={20}
                        color={NAVY}
                      />
                      <Text style={styles.radioLabel}>User</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.radioRow}
                      onPress={() => setRole(true)}
                    >
                      <MaterialIcons
                        name={isAdminRole ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={20}
                        color={NAVY}
                      />
                      <Text style={styles.radioLabel}>Administrator</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
              {companyItems.length > 0 ? (
                <>
                  <PickerRow
                    label="Companies"
                    value={companiesLabel}
                    onPress={() => setOpenSheet('companies')}
                  />
                  <PickerRow
                    label="Default Company"
                    value={defaultCompanyName}
                    onPress={() => setOpenSheet('defaultCompany')}
                    last
                  />
                </>
              ) : null}
            </View>

            {/* One section per parent category — MASTER DATA, ACCOUNTING, etc. */}
            {visibleSections.map((sec) => (
              <React.Fragment key={`sec-${sec.id}`}>
                <SectionHeader icon="folder-open">{(sec.name || '').toUpperCase()}</SectionHeader>
                <View style={styles.card}>
                  {sec.leaves.map((lf, idx) => (
                    <PickerRow
                      key={`leaf-${lf.id}`}
                      label={lf.name}
                      value={groupNameForCategory(lf.id)}
                      onPress={() => setOpenSheet(`cat:${lf.id}`)}
                      last={idx === sec.leaves.length - 1}
                    />
                  ))}
                </View>
              </React.Fragment>
            ))}

            {visibleSections.length === 0 && companyItems.length === 0 && !adminCategory ? (
              <View style={styles.card}>
                <Text style={styles.hint}>No access categories available.</Text>
              </View>
            ) : null}

            {/* SECURITY */}
            <SectionHeader icon="lock">SECURITY</SectionHeader>
            <View style={styles.card}>
              {mode === 'create' ? (
                <View style={styles.lockRow}>
                  <MaterialIcons name="lock-outline" size={20} color={MUTED} />
                  <Text style={styles.lockText}>
                    Save the user first to change the password.
                  </Text>
                </View>
              ) : (
                <>
                  <FormInput
                    label="New Password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    password
                  />
                  <FormInput
                    label="Confirm"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    password
                  />
                  <FeatureGate featureKey="users.change_password">
                    <TouchableOpacity
                      style={[styles.secondaryBtn, changingPwd && { opacity: 0.6 }]}
                      onPress={handleChangePassword}
                      disabled={changingPwd}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name="key" size={18} color={NAVY} />
                      <Text style={styles.secondaryBtnText}>
                        {changingPwd ? 'Updating…' : 'Change Password'}
                      </Text>
                    </TouchableOpacity>
                  </FeatureGate>
                </>
              )}
            </View>

            {saving ? (
              <View style={styles.savingRow}>
                <ActivityIndicator color={NAVY} size="small" />
                <Text style={styles.savingText}>Saving…</Text>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Centred popup — only ONE Modal mounted at a time. Stacking
            multiple <Modal> components (even with visible={false})
            freezes input on RN, so we render exactly the active one. */}
        {openSheet === 'companies' ? (
          <CenterPickerModal
            visible
            title="Companies"
            items={companyItems}
            multi
            selectedIds={form.companyIds}
            onConfirm={(ids) => setForm((p) => ({ ...p, companyIds: ids }))}
            onClose={() => setOpenSheet(null)}
          />
        ) : null}
        {openSheet === 'defaultCompany' ? (
          <CenterPickerModal
            visible
            title="Default Company"
            items={defaultCompanyItems}
            selectedId={form.defaultCompanyId}
            onSelect={(item) => setForm((p) => ({ ...p, defaultCompanyId: item?.id ?? null }))}
            onClose={() => setOpenSheet(null)}
          />
        ) : null}
        {openCat ? (
          <CenterPickerModal
            visible
            title={openCat.name}
            items={catItems}
            selectedId={form.groupByCategory[openCat.id] ?? null}
            onSelect={(item) => setForm((p) => ({
              ...p,
              groupByCategory: { ...p.groupByCategory, [openCat.id]: item?.id ?? null },
            }))}
            onClose={() => setOpenSheet(null)}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
};

export default UserDetailsScreen;

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: 14,
    paddingBottom: 60,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8,
    marginLeft: 4,
    gap: 6,
  },
  sectionHeader: {
    fontSize: 12,
    color: NAVY,
    letterSpacing: 0.6,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
    gap: 12,
  },
  pickerLabel: {
    fontSize: 14,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    flexShrink: 0,
  },
  pickerValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    gap: 2,
  },
  pickerValue: {
    fontSize: 14,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistMedium,
    textAlign: 'right',
    flexShrink: 1,
  },
  pickerValueUnset: {
    color: MUTED,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
    gap: 12,
  },
  roleOptions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  radioLabel: {
    fontSize: 14,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  hint: {
    fontSize: 12,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    paddingVertical: 10,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  lockText: {
    marginLeft: 8,
    color: MUTED,
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    flex: 1,
  },
  secondaryBtn: {
    marginTop: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.2,
    borderColor: NAVY,
    borderRadius: 10,
    paddingVertical: 12,
    gap: 6,
  },
  secondaryBtnText: {
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 14,
    letterSpacing: 0.4,
  },
  savingRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  savingText: {
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 13,
  },
});

const popupStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,17,30,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: POPUP_MAX_HEIGHT,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingTop: 14,
    paddingBottom: 6,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 12 },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
  },
  title: {
    fontSize: 15,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    flex: 1,
    marginRight: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowOn: {
    backgroundColor: '#EEF2FF',
  },
  rowText: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  rowTextOn: {
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEF1F5',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  cancelText: {
    color: '#374151',
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  doneBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: NAVY,
  },
  doneText: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
});
