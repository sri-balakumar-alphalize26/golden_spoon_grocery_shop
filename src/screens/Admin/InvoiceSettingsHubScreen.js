// Invoice Settings hub — mirrors the Odoo backend submenu (Point of Sale →
// Invoice Settings), which is now split into three sections:
//   • General Settings    — template, branding, logo, toggles, default size
//   • Receipt Paper Sizes — the per-company editable size list
//   • Invoice Layouts     — per-size block layouts (preview only in-app)
// Reached from InvoiceSettingsList after picking a company; passes the settings
// record id + company down to each sub-screen. Admin-only (same guard shape as
// the other admin screens).
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const SECTIONS = [
  {
    key: 'general',
    title: 'General Settings',
    desc: 'Invoice template, branding, logo, toggles and the default receipt size.',
    icon: 'tune',
    screen: 'InvoiceSettings',
  },
  {
    key: 'sizes',
    title: 'Receipt Paper Sizes',
    desc: 'Add, edit and reorder the paper sizes your shop prints on.',
    icon: 'straighten',
    screen: 'ReceiptPaperSizes',
  },
  {
    key: 'layouts',
    title: 'Invoice Layouts',
    desc: 'Preview each size’s custom block layout (designed in Odoo).',
    icon: 'dashboard-customize',
    screen: 'InvoiceLayouts',
  },
];

const InvoiceSettingsHubScreen = ({ navigation, route }) => {
  const authUser = useAuthStore((s) => s.user);
  const [isAdmin, setIsAdmin] = useState(false);

  const recordId = route?.params?.id ?? null;
  const companyId = route?.params?.companyId ?? null;
  const companyName = route?.params?.companyName || '';

  useEffect(() => {
    const ok = authUser?.uid === 2 || authUser?.is_admin === true || authUser?.is_superuser === true;
    setIsAdmin(ok);
    if (!ok) {
      showToastMessage('Only administrators can access Invoice Settings');
      setTimeout(() => navigation.goBack(), 1500);
    }
  }, [authUser, navigation]);

  const open = (section) => {
    if (section.screen === 'InvoiceSettings') {
      navigation.navigate('InvoiceSettings', { id: recordId });
    } else {
      navigation.navigate(section.screen, { companyId, companyName });
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

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="Invoice Settings" onBackPress={() => navigation.goBack()} />
      <View style={styles.container}>
        {companyName ? <Text style={styles.company}>{companyName}</Text> : null}
        {SECTIONS.map((s) => (
          <TouchableOpacity key={s.key} style={styles.card} activeOpacity={0.8} onPress={() => open(s)}>
            <View style={styles.cardIcon}>
              <MaterialIcons name={s.icon} size={24} color={NAVY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{s.title}</Text>
              <Text style={styles.cardDesc}>{s.desc}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#c7ccd6" />
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  muted: { color: '#8896ab', fontFamily: FONT_FAMILY.urbanistMedium },
  company: {
    fontSize: 13, fontFamily: FONT_FAMILY.urbanistBold, color: '#6b7280',
    marginBottom: 10, marginLeft: 2, letterSpacing: 0.3,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14,
    padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#eef0f4',
  },
  cardIcon: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#F3E5F5',
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  cardTitle: { fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, color: '#111827' },
  cardDesc: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#9ca3af', marginTop: 3, lineHeight: 16 },
});

export default InvoiceSettingsHubScreen;
