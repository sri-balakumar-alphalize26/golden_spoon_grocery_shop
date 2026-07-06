// In-app admin editor for the dynamic POS invoice settings. Reads/writes the
// SAME Odoo `pos.invoice.settings` record the Odoo backend "Invoice Settings"
// edits, so a change here is identical to one made in Odoo web. Admin-only
// (same guard shape as AppFeaturesScreen). Includes the "Use Dynamic Invoice
// on App" master switch, all branding fields, logo upload, show/hide toggles
// and the bilingual Terms & Conditions list.
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Switch, Image, Platform, FlatList,
} from 'react-native';
import Modal from 'react-native-modal';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { fetchInvoiceSettings, saveInvoiceSettings, fetchInvoiceCompanies, fetchInvoiceLogo } from '@api/services/generalApi';
import PaperSizeModal, { SIZES } from '@components/Modal/PaperSizeModal';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const InvoiceSettingsScreen = ({ navigation, route }) => {
  const recordId = route?.params?.id || null;
  const isNew = !!route?.params?.isNew;
  const authUser = useAuthStore((s) => s.user);
  const companyProfile = useAuthStore((s) => s.companyProfile);

  const [isAdmin, setIsAdmin] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [saving, setSaving] = useState(false);

  const [id, setId] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [companyLabel, setCompanyLabel] = useState('');
  const [companies, setCompanies] = useState([]);
  const [companyPickerVisible, setCompanyPickerVisible] = useState(false);
  const [existingLogoB64, setExistingLogoB64] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  // Scalar fields
  const [useDynamic, setUseDynamic] = useState(false);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [showLogo, setShowLogo] = useState(true);
  const [headerTitle, setHeaderTitle] = useState('');
  const [footerText, setFooterText] = useState('');
  const [showTax, setShowTax] = useState(true);
  const [showCustomerSig, setShowCustomerSig] = useState(true);
  const [showCashierSig, setShowCashierSig] = useState(true);
  const [showFooter, setShowFooter] = useState(true);

  // Default receipt size (per-company). Applies to BOTH the dynamic and the
  // normal receipt: when on, the app skips its size prompt and prints at
  // defaultSizeStr (mm as a string, matching the Odoo selection).
  const [useDefaultSize, setUseDefaultSize] = useState(false);
  const [defaultSizeStr, setDefaultSizeStr] = useState('80');
  const [sizePickerVisible, setSizePickerVisible] = useState(false);

  // Logo edit state: pickedLogoUri (local preview) + logoBase64
  //   undefined = leave unchanged, false = clear, string = new base64.
  const [pickedLogoUri, setPickedLogoUri] = useState(null);
  const [logoBase64, setLogoBase64] = useState(undefined);

  // Admin guard — same shape as AppFeaturesScreen.
  useEffect(() => {
    const ok = authUser?.uid === 2 || authUser?.is_admin === true || authUser?.is_superuser === true;
    setIsAdmin(ok);
    if (!ok) {
      showToastMessage('Only administrators can access Invoice Settings');
      setTimeout(() => navigation.goBack(), 1500);
    }
  }, [authUser, navigation]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        console.log('[InvoiceSettings] open — mode=' + (isNew ? 'NEW(create)' : (recordId ? ('EDIT id=' + recordId) : 'EDIT(current company)')));
        if (isNew) {
          // Blank create form (like Odoo "New"): no company preselected — the
          // admin must pick one from the dropdown; no existing record loaded.
          const rows = await fetchInvoiceCompanies();
          setCompanies(rows || []);
          setId(null);
          setCompanyId(null);
          setCompanyLabel('');
          setUseDynamic(false);
          setHeaderTitle('INVOICE / فاتورة');
          setFooterText('Thank you for your purchase!\nشكرا لشرائك!');
          return;
        }
        const s = await fetchInvoiceSettings(recordId);
        if (!s) {
          showToastMessage('Dynamic Invoice module not installed on this Odoo');
          setTimeout(() => navigation.goBack(), 1500);
          return;
        }
        setId(s.id);
        const recCompany = Array.isArray(s.company_id) ? s.company_id[1] : '';
        setCompanyId(Array.isArray(s.company_id) ? s.company_id[0] : null);
        setCompanyLabel(recCompany);
        fetchInvoiceCompanies().then((rows) => setCompanies(rows || [])).catch(() => {});
        fetchInvoiceLogo(s.id).then((b64) => setExistingLogoB64(b64)).catch(() => {});
        setUseDynamic(!!s.use_dynamic_invoice);
        setAddress(s.address || '');
        setPhone(s.phone || '');
        setEmail(s.email || '');
        setVatNumber(s.vat_number || '');
        setShowLogo(s.show_logo !== false);
        setHeaderTitle(s.header_title || '');
        setFooterText(s.footer_text || '');
        setShowTax(s.show_tax !== false);
        setShowCustomerSig(s.show_customer_signature !== false);
        setShowCashierSig(s.show_shop_owner_signature !== false);
        setShowFooter(s.show_footer !== false);
        setUseDefaultSize(!!s.use_default_paper_size);
        setDefaultSizeStr(s.default_paper_size || '80');
      } catch (e) {
        console.error('[InvoiceSettings] bootstrap', e);
        showToastMessage(e?.message || 'Failed to load settings');
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [isAdmin, navigation]);

  const pickLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showToastMessage('Photo permission is needed to pick a logo'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8, base64: true, allowsEditing: true,
      });
      if (res.canceled) return;
      const asset = res.assets && res.assets[0];
      if (!asset?.base64) { showToastMessage('Could not read the selected image'); return; }
      setPickedLogoUri(asset.uri);
      setLogoBase64(asset.base64);
    } catch (e) {
      console.error('[InvoiceSettings] pickLogo', e);
      showToastMessage('Failed to pick image');
    }
  };

  const clearLogo = () => {
    setPickedLogoUri(null);
    setLogoBase64(false); // false → clear on save
  };

  const onSave = async () => {
    if (!companyId) { setErrorMsg('Please select a company first.'); return; }
    setSaving(true);
    try {
      console.log('[InvoiceSettings] save — mode=' + (id ? ('write id=' + id) : 'create') + ' companyId=' + companyId + ' useDynamic=' + useDynamic);
      const savedId = await saveInvoiceSettings({
        id,
        vals: {
          ...(companyId ? { company_id: companyId } : {}),
          use_dynamic_invoice: !!useDynamic,
          address: address || false,
          phone: phone || false,
          email: email || false,
          vat_number: vatNumber || false,
          show_logo: !!showLogo,
          header_title: headerTitle || false,
          footer_text: footerText || false,
          show_tax: !!showTax,
          show_customer_signature: !!showCustomerSig,
          show_shop_owner_signature: !!showCashierSig,
          show_footer: !!showFooter,
          use_default_paper_size: !!useDefaultSize,
          default_paper_size: defaultSizeStr || '80',
        },
        logoBase64, // undefined = unchanged, false = clear, string = new
      });
      console.log('[InvoiceSettings] saved -> id=', savedId);
      if (savedId) setId(savedId);
      showToastMessage('Invoice settings saved');
      // Reflect a dynamic-toggle change in the app immediately.
      try { useAuthStore.getState().refreshDynamicInvoiceFlag?.(); } catch (_) {}
      navigation.goBack();
    } catch (e) {
      console.error('[InvoiceSettings] save', e);
      // Show the Odoo message (e.g. the "one record per company" constraint) in
      // a popup matching the logout style, instead of a transient toast.
      setErrorMsg(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <NavigationHeader title="Invoice Settings" onBackPress={() => navigation.goBack()} />
        <View style={styles.center}><Text style={styles.muted}>Access denied</Text></View>
      </SafeAreaView>
    );
  }

  if (bootstrapping) {
    return (
      <SafeAreaView backgroundColor={NAVY}>
        <NavigationHeader title="Invoice Settings" onBackPress={() => navigation.goBack()} />
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      </SafeAreaView>
    );
  }

  // Show the freshly picked image; else the stored logo as a base64 data URI
  // (renders reliably in RN, unlike /web/image which needs the session cookie).
  const showExisting = logoBase64 === undefined && !pickedLogoUri;
  const previewSource = pickedLogoUri
    ? { uri: pickedLogoUri }
    : (showExisting && existingLogoB64 ? { uri: `data:image/png;base64,${existingLogoB64}` } : null);

  // Human label for the current default size, e.g. "A5 (148 mm)".
  const sizeLabel = (val) => {
    const found = SIZES.find((x) => String(x.mm) === String(val));
    return found ? `${found.inch} (${found.mm} mm)` : `${val} mm`;
  };

  const Row = ({ label, help, value, onValueChange }) => (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {help ? <Text style={styles.toggleHelp}>{help}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: ORANGE }} />
    </View>
  );

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader
        title={isNew ? 'New Invoice Settings' : 'Invoice Settings'}
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 12, paddingBottom: 110 }}>

        {/* Master switch */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.sectionTitle}>Use Dynamic Invoice on App</Text>
              <Text style={styles.toggleHelp}>
                On → the app shows this dynamic receipt (logo, GST, layout below).
                Off → the app shows its normal built-in receipt.
              </Text>
            </View>
            <Switch value={useDynamic} onValueChange={setUseDynamic} trackColor={{ true: ORANGE }} />
          </View>
        </View>

        {/* Receipt Size — ALWAYS visible (applies to both the dynamic and the
            normal receipt). When on, the app skips its size prompt on
            Preview / Download / Print and prints at the chosen size. */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.sectionTitle}>Receipt Size</Text>
              <Text style={styles.toggleHelp}>
                On → Preview, Download and Print use the size below without asking each time.
                Off → the app asks for a size each time.
              </Text>
            </View>
            <Switch value={useDefaultSize} onValueChange={setUseDefaultSize} trackColor={{ true: ORANGE }} />
          </View>
          {useDefaultSize ? (
            <>
              <Text style={styles.label}>Default Size</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setSizePickerVisible(true)}>
                <Text style={styles.pickerValue}>{sizeLabel(defaultSizeStr)}</Text>
                <MaterialIcons name="arrow-drop-down" size={22} color="#666" />
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {!useDynamic ? (
          <View style={styles.card}>
            <Text style={styles.toggleHelp}>
              Turn on “Use Dynamic Invoice on App” above to configure the invoice — branding, logo,
              header/footer, show-hide options and terms. While it's off, the app shows its normal
              built-in receipt and there's nothing to set here.
            </Text>
          </View>
        ) : (
        <>
        {/* Branding */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Branding</Text>
          <Text style={styles.hint}>Blank fields fall back to the company's own details.</Text>

          <Text style={styles.label}>Company</Text>
          <TouchableOpacity style={styles.picker} onPress={() => setCompanyPickerVisible(true)}>
            <Text style={styles.pickerValue}>{companyLabel || 'Select company'}</Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#666" />
          </TouchableOpacity>

          <Text style={styles.label}>Address</Text>
          <TextInput style={[styles.input, styles.multiline]} value={address} onChangeText={setAddress} placeholder="One line per row" placeholderTextColor="#999" multiline />

          <Text style={styles.label}>Phone</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Defaults to company phone" placeholderTextColor="#999" />

          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Defaults to company email" placeholderTextColor="#999" keyboardType="email-address" autoCapitalize="none" />

          <Text style={styles.label}>VAT / GST Number</Text>
          <TextInput style={styles.input} value={vatNumber} onChangeText={setVatNumber} placeholder="e.g. 3001234567890" placeholderTextColor="#999" />
        </View>

        {/* Logo */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Logo</Text>
          <View style={styles.logoRow}>
            <View style={styles.logoPreview}>
              {previewSource ? (
                <Image source={previewSource} style={styles.logoImg} resizeMode="contain" />
              ) : (
                <MaterialIcons name="image" size={40} color="#c7ccd6" />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <TouchableOpacity style={styles.smallBtn} onPress={pickLogo}>
                <MaterialIcons name="photo-library" size={18} color="#fff" />
                <Text style={styles.smallBtnText}>Change logo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, styles.smallBtnGhost]} onPress={clearLogo}>
                <MaterialIcons name="delete-outline" size={18} color="#dc2626" />
                <Text style={[styles.smallBtnText, { color: '#dc2626' }]}>Remove logo</Text>
              </TouchableOpacity>
              <Text style={styles.toggleHelp}>Any image; it's auto-resized for the receipt.</Text>
            </View>
          </View>
          <Row label="Show logo on receipt" value={showLogo} onValueChange={setShowLogo} />
        </View>

        {/* Header & footer */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Header &amp; Footer</Text>
          <Text style={styles.label}>Header Title</Text>
          <TextInput style={styles.input} value={headerTitle} onChangeText={setHeaderTitle} placeholder="INVOICE / فاتورة" placeholderTextColor="#999" />
          <Text style={styles.label}>Footer Text</Text>
          <TextInput style={[styles.input, styles.multiline]} value={footerText} onChangeText={setFooterText} placeholder="Thank you for your purchase!" placeholderTextColor="#999" multiline />
        </View>

        {/* Show/hide toggles */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Show / Hide on Receipt</Text>
          <Row label="Tax row" value={showTax} onValueChange={setShowTax} />
          <Row label="Customer signature" value={showCustomerSig} onValueChange={setShowCustomerSig} />
          <Row label="Cashier signature" value={showCashierSig} onValueChange={setShowCashierSig} />
          <Row label="Footer" value={showFooter} onValueChange={setShowFooter} />
        </View>
        </>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.btn, styles.btnConfirm, saving && { opacity: 0.6 }]} disabled={saving} onPress={onSave}>
          {saving ? <ActivityIndicator color="#fff" /> : (
            <>
              <MaterialIcons name="check" size={20} color="#fff" />
              <Text style={styles.btnConfirmText}>Save Settings</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        isVisible={!!errorMsg}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        backdropOpacity={0.7}
        onBackButtonPress={() => setErrorMsg(null)}
        onBackdropPress={() => setErrorMsg(null)}
      >
        <View style={styles.alertContainer}>
          <Text style={styles.alertText}>{errorMsg}</Text>
          <TouchableOpacity style={[styles.alertButton, { minWidth: 120 }]} onPress={() => setErrorMsg(null)}>
            <Text style={styles.alertButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <PaperSizeModal
        isVisible={sizePickerVisible}
        onSelect={(mm) => { setDefaultSizeStr(String(mm)); setSizePickerVisible(false); }}
        onCancel={() => setSizePickerVisible(false)}
      />

      <Modal
        isVisible={companyPickerVisible}
        animationIn="zoomIn"
        animationOut="zoomOut"
        backdropOpacity={0.4}
        onBackdropPress={() => setCompanyPickerVisible(false)}
        onBackButtonPress={() => setCompanyPickerVisible(false)}
        style={styles.modalCenter}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Company</Text>
            <TouchableOpacity onPress={() => setCompanyPickerVisible(false)} style={styles.modalCloseBtn}>
              <MaterialIcons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={companies}
            keyExtractor={(it) => `co-${it.id}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => { setCompanyId(item.id); setCompanyLabel(item.name); setCompanyPickerVisible(false); }}
              >
                <Text style={styles.pickerRowText}>{item.name}</Text>
                {companyId === item.id ? <MaterialIcons name="check" size={20} color={ORANGE} /> : null}
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={styles.emptyPicker}>No companies found</Text>}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  muted: { color: '#8896ab', fontFamily: FONT_FAMILY.urbanistMedium },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#eef0f4',
  },
  readonly: { fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistSemiBold, marginTop: 2 },
  picker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#fff',
  },
  pickerValue: { flex: 1, fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistSemiBold },
  modalCenter: { margin: 24, justifyContent: 'center', alignItems: 'center' },
  modalCard: {
    width: '100%', maxHeight: 420, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', paddingBottom: 8,
    ...Platform.select({ android: { elevation: 10 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 } }),
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalTitle: { fontSize: 17, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY, flex: 1 },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f5f5f8' },
  pickerRowText: { fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistSemiBold },
  emptyPicker: { textAlign: 'center', padding: 30, color: '#9ca3af', fontFamily: FONT_FAMILY.urbanistMedium },
  // Logout-style alert popup (for the one-per-company constraint message)
  alertContainer: {
    backgroundColor: '#fff', borderRadius: 10, borderColor: NAVY, borderWidth: 2,
    paddingVertical: 22, paddingHorizontal: 14, alignItems: 'center',
  },
  alertText: { marginVertical: 18, fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, textAlign: 'center', color: '#111827' },
  alertButton: { backgroundColor: NAVY, borderRadius: 10, padding: 15, justifyContent: 'center', alignItems: 'center' },
  alertButtonText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold },
  sectionTitle: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY, marginBottom: 4 },
  hint: { fontSize: 11, color: '#9ca3af', fontFamily: FONT_FAMILY.urbanistMedium, marginBottom: 6 },
  label: { fontSize: 12, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistSemiBold, marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827', fontFamily: FONT_FAMILY.urbanistMedium, backgroundColor: '#fff',
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f2f6', marginTop: 6,
  },
  toggleLabel: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#374151' },
  toggleHelp: { fontSize: 11, color: '#9ca3af', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 2 },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  logoPreview: {
    width: 84, height: 84, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafbfc', overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },
  smallBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: ORANGE, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8,
  },
  smallBtnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' },
  smallBtnText: { color: '#fff', fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  addBtnText: { color: ORANGE, fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 2 },
  termRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
  termDelete: { marginLeft: 8, marginTop: 8, padding: 4 },
  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee',
  },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnConfirm: {
    backgroundColor: ORANGE,
    shadowColor: ORANGE, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  btnConfirmText: { color: '#fff', fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 4 },
});

export default InvoiceSettingsScreen;
