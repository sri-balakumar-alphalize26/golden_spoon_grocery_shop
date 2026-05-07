// Customer ID Proofs — dedicated browse screen.
//
// Lists customers narrowed to those who have at least one ID-proof
// binary on file (id_proof_front or id_proof_back). Tapping a row
// opens the existing CustomerInfo screen, where the IdProofCards
// section lives — single source of truth, no parallel UI.
//
// Mirrors the tools-rental "Customer ID Proofs" tile in pattern.
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import { fetchCustomersOdoo, fetchPartnersWithIdProofOdoo, fetchPartnerIdProofOdoo } from '@api/services/generalApi';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NAVY = COLORS.primaryThemeColor;
const MUTED = '#8896ab';

const CustomerIdProofsScreen = ({ navigation }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    () => loadList(),
    400
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      // 1) Find partner ids that have at least one id_proof attachment.
      const proofMap = await fetchPartnersWithIdProofOdoo();
      if (proofMap.size === 0) {
        setData([]);
        return;
      }
      // 2) Pull the matching partners. We fetch a generous slice and
      //    filter to the proof-having partner ids client-side.
      const all = await fetchCustomersOdoo({ limit: 500, searchText });
      const filtered = (all || []).filter((c) => proofMap.has(c.id));
      // 3) Hydrate each row with the front-thumb (a small extra fetch
      //    per row, but only for the visible filtered set — usually a
      //    handful of customers, not the whole address book).
      const hydrated = await Promise.all(filtered.map(async (c) => {
        const sides = proofMap.get(c.id) || { front: false, back: false };
        let frontDatas = null;
        if (sides.front) {
          try {
            const { id_proof_front } = await fetchPartnerIdProofOdoo(c.id);
            frontDatas = id_proof_front;
          } catch (_) { /* leave thumb empty */ }
        }
        return {
          ...c,
          id_proof_front: frontDatas,
          // Drive the Front/Back badges from the search-mapped flags
          // even when we don't bother loading the back's base64 here.
          _has_front: !!sides.front,
          _has_back: !!sides.back,
        };
      }));
      setData(hydrated);
    } catch (_) {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  useFocusEffect(
    useCallback(() => {
      loadList();
    }, [loadList])
  );

  const renderItem = useCallback(({ item }) => {
    const hasFront = !!(item.id_proof_front || item._has_front);
    const hasBack = !!item._has_back;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.row}
        onPress={() => navigation.navigate('CustomerIdProofDetail', { customer: item })}
      >
        {hasFront ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${item.id_proof_front}` }}
            style={styles.rowThumb}
          />
        ) : (
          <View style={[styles.rowThumb, styles.rowThumbEmpty]}>
            <MaterialIcons name="image-not-supported" size={24} color={MUTED} />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name || '—'}</Text>
          {item.phone ? (
            <Text style={styles.rowMeta} numberOfLines={1}>{item.phone}</Text>
          ) : null}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, hasFront ? styles.badgeOn : styles.badgeOff]}>
              <Text style={[styles.badgeText, hasFront ? styles.badgeTextOn : styles.badgeTextOff]}>
                Front
              </Text>
            </View>
            <View style={[styles.badge, hasBack ? styles.badgeOn : styles.badgeOff]}>
              <Text style={[styles.badgeText, hasBack ? styles.badgeTextOn : styles.badgeTextOff]}>
                Back
              </Text>
            </View>
          </View>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={MUTED} />
      </TouchableOpacity>
    );
  }, [navigation]);

  const keyExtractor = useCallback((item, index) => `idproof-${item.id || index}`, []);

  return (
    <SafeAreaView backgroundColor="#fff">
      <NavigationHeader
        title="Customer ID Proofs"
        onBackPress={() => navigation.goBack()}
      />
      <SearchContainer
        placeholder="Search by name or phone"
        onChangeText={handleSearchTextChange}
        value={searchText}
      />
      {loading && data.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      ) : data.length === 0 ? (
        <EmptyState
          imageSource={require('@assets/images/EmptyData/empty_data.png')}
          message="No customers with ID proofs yet"
        />
      ) : (
        <FlashList
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ padding: 8, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={84}
        />
      )}
    </SafeAreaView>
  );
};

export default CustomerIdProofsScreen;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 6,
    marginVertical: 4,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  rowThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#000',
    resizeMode: 'cover',
  },
  rowThumbEmpty: {
    backgroundColor: '#F1F2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: {
    fontSize: 14,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  rowMeta: {
    fontSize: 12,
    color: MUTED,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeOn: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  badgeOff: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  badgeTextOn: { color: '#166534' },
  badgeTextOff: { color: '#9F1239' },
});
