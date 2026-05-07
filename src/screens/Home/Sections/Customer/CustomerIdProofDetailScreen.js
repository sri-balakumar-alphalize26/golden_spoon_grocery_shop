// Focused ID-proof detail screen — opened from the Customer ID Proofs
// tile on Home. Shows just the cashier-relevant fields (name, phone,
// email) and the Front + Back proof cards. The full edit form lives
// at CustomerInfo; this screen is intentionally read-only and tight.
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { MaterialIcons } from '@expo/vector-icons';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchPartnerIdProofOdoo } from '@api/services/generalApi';
import {
  getCachedPartnerProof,
  primePartnerCache,
} from '@api/services/customerCache';
import { IdProofCards } from '@components/IdProof';

const NAVY = COLORS.primaryThemeColor;
const MUTED = '#8896ab';

const AVATAR_TINTS = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#fed7aa', '#ddd6fe', '#fecaca'];
const tintFor = (id) => AVATAR_TINTS[Math.abs(Number(id) || 0) % AVATAR_TINTS.length];

const CustomerIdProofDetailScreen = ({ navigation, route }) => {
  const { customer } = route?.params || {};
  const partnerId = customer?.id || null;

  const [proof, setProof] = useState({ front: null, back: null, loading: true });

  useEffect(() => {
    if (!partnerId) {
      setProof({ front: null, back: null, loading: false });
      return;
    }
    let alive = true;
    // Hit the prefetch cache when the previous list already primed it,
    // otherwise kick off a fresh fetch.
    const cached = getCachedPartnerProof(partnerId);
    const promise = cached || (primePartnerCache(partnerId), getCachedPartnerProof(partnerId)) || fetchPartnerIdProofOdoo(partnerId);
    Promise.resolve(promise)
      .then((res) => {
        if (!alive) return;
        setProof({
          front: res?.id_proof_front || null,
          back: res?.id_proof_back || null,
          loading: false,
        });
      })
      .catch(() => {
        if (alive) setProof({ front: null, back: null, loading: false });
      });
    return () => { alive = false; };
  }, [partnerId]);

  const initial = (customer?.name || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <SafeAreaView backgroundColor="#F5F6FA">
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <NavigationHeader
        title="ID Proof"
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card — avatar initial, name, contact rows */}
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: tintFor(partnerId) }]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
          <Text style={styles.name} numberOfLines={2}>{customer?.name || '—'}</Text>

          {customer?.phone ? (
            <View style={styles.contactRow}>
              <View style={styles.contactIconBox}>
                <MaterialIcons name="phone" size={18} color={NAVY} />
              </View>
              <Text style={styles.contactText} numberOfLines={1}>{customer.phone}</Text>
            </View>
          ) : null}

          {customer?.email ? (
            <View style={styles.contactRow}>
              <View style={styles.contactIconBox}>
                <MaterialIcons name="email" size={18} color={NAVY} />
              </View>
              <Text style={styles.contactText} numberOfLines={1}>{customer.email}</Text>
            </View>
          ) : null}

          {!customer?.phone && !customer?.email ? (
            <Text style={styles.emptyContact}>No contact info on file</Text>
          ) : null}
        </View>

        {/* ID Proof section */}
        <Text style={styles.sectionTitle}>ID PROOF</Text>
        {proof.loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={NAVY} />
          </View>
        ) : (
          <IdProofCards
            front={proof.front}
            back={proof.back}
            onChange={() => {}}
            readOnly
          />
        )}

        {/* Quick action — open the full contact (edit) for cashiers
            who need to update something */}
        {partnerId ? (
          <TouchableOpacity
            style={styles.editBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('CustomerInfo', { details: customer, mode: 'edit' })}
          >
            <MaterialIcons name="edit" size={18} color="#fff" />
            <Text style={styles.editBtnText}>Edit full contact</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

export default CustomerIdProofDetailScreen;

const styles = StyleSheet.create({
  hero: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
    }),
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 32,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  name: {
    fontSize: 19,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
    marginTop: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  contactIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  contactText: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  emptyContact: {
    fontSize: 12,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 10,
    marginLeft: 4,
  },
  loadingBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVY,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 18,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: NAVY, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  editBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
});
