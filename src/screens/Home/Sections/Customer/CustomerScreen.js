import React, { useEffect, useCallback, useState } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import {
  fetchCustomersOdoo,
  fetchPartnersWithIdProofOdoo,
  fetchPartnerIdProofOdoo,
} from '@api/services/generalApi';
import { primePartnerCache } from '@api/services/customerCache';
import { IdProofCards } from '@components/IdProof';

import { useDataFetching, useDebouncedSearch } from '@hooks';
import Text from '@components/Text';
import {
  TouchableOpacity,
  ActivityIndicator,
  View,
  Image,
  StyleSheet,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { FABButton } from '@components/common/Button';
import { FeatureGate } from '@components/FeatureGate';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const AVATAR_TINTS = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#fed7aa', '#ddd6fe', '#fecaca'];
const tintFor = (id) => AVATAR_TINTS[Math.abs(Number(id) || 0) % AVATAR_TINTS.length];

const CustomerScreen = ({ navigation, route }) => {
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchCustomersOdoo);
  const [failedImageIds, setFailedImageIds] = useState(() => new Set());
  // Map<partnerId, { front: bool, back: bool }> — drives the F / B
  // pills next to each customer name. Refreshed on focus alongside the
  // partner list so newly uploaded proofs flip the pills immediately.
  const [proofMap, setProofMap] = useState(() => new Map());

  // Preview modal — only available in POS select-mode (the cashier
  // picking a customer for an order). Holds the row whose preview is
  // open + the lazy-fetched ID-proof base64 strings.
  const isSelectMode = !!route?.params?.selectMode;
  const [previewCustomer, setPreviewCustomer] = useState(null);
  const [previewProof, setPreviewProof] = useState({ front: null, back: null, loading: false });

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text }),
    500
  );

  useFocusEffect(
    useCallback(() => {
      fetchData({ searchText });
      // Refresh the id_proof attachment map alongside the customer
      // list so the F / B pills reflect any uploads done from the
      // detail screen since we last looked.
      fetchPartnersWithIdProofOdoo()
        .then((m) => setProofMap(m || new Map()))
        .catch(() => setProofMap(new Map()));
    }, [searchText])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData({ searchText });
    }
  }, [isFocused, searchText]);

  const handleLoadMore = () => {
    fetchMoreData({ searchText });
  };

  // Open the preview modal — fetches the ID-proof binaries for the
  // tapped customer the moment the modal opens (cheap single-row read).
  const openPreview = (item) => {
    setPreviewCustomer(item);
    setPreviewProof({ front: null, back: null, loading: true });
    // Prime the shared cache too — if the cashier later taps Edit on
    // the same row, CustomerInfo will hit a warm cache.
    primePartnerCache(item.id);
    fetchPartnerIdProofOdoo(item.id)
      .then((res) => {
        setPreviewProof({
          front: res?.id_proof_front || null,
          back: res?.id_proof_back || null,
          loading: false,
        });
      })
      .catch(() => setPreviewProof({ front: null, back: null, loading: false }));
  };
  const closePreview = () => {
    setPreviewCustomer(null);
    setPreviewProof({ front: null, back: null, loading: false });
  };

  const renderAvatar = (item) => {
    const initial = (item?.name || '?').trim().charAt(0).toUpperCase() || '?';
    const fallback = (
      <View style={[styles.avatarFallback, { backgroundColor: tintFor(item?.id) }]}>
        <Text style={styles.avatarInitial}>{initial}</Text>
      </View>
    );
    if (!item?.image_url || failedImageIds.has(item.id)) {
      return fallback;
    }
    return (
      <Image
        source={{ uri: item.image_url }}
        style={styles.avatar}
        onError={() => {
          setFailedImageIds((prev) => {
            const next = new Set(prev);
            next.add(item.id);
            return next;
          });
        }}
      />
    );
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    const phone = (item?.phone && String(item.phone).trim()) || '';

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.card}
        onPress={() => {
          // Fire detail + ID-proof fetches before navigating so the
          // contact details screen mounts with the responses already
          // in flight (or done). Idempotent — duplicate primes reuse
          // the in-flight promise.
          primePartnerCache(item.id);
          if (route?.params?.selectMode && typeof route.params.onSelect === 'function') {
            route.params.onSelect(item);
            navigation.goBack();
            return;
          }
          navigation.navigate('CustomerInfo', { details: item, mode: 'view' });
        }}
      >
        {renderAvatar(item)}

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {item?.name?.trim() || '-'}
          </Text>
          {(() => {
            const sides = proofMap.get(item.id) || { front: false, back: false };
            return (
              <View style={styles.proofPillRow}>
                <View style={[styles.proofPill, sides.front ? styles.proofPillOn : styles.proofPillOff]}>
                  <Text style={[styles.proofPillText, sides.front ? styles.proofPillTextOn : styles.proofPillTextOff]}>
                    {sides.front ? 'ID Proof F ✓' : 'ID Proof F'}
                  </Text>
                </View>
                <View style={[styles.proofPill, sides.back ? styles.proofPillOn : styles.proofPillOff]}>
                  <Text style={[styles.proofPillText, sides.back ? styles.proofPillTextOn : styles.proofPillTextOff]}>
                    {sides.back ? 'ID Proof B ✓' : 'ID Proof B'}
                  </Text>
                </View>
              </View>
            );
          })()}
          {phone ? (
            <View style={styles.phoneRow}>
              <MaterialIcons name="phone" size={13} color="#8896ab" style={{ marginRight: 4 }} />
              <Text style={styles.phone} numberOfLines={1}>{phone}</Text>
            </View>
          ) : item?.email ? (
            <View style={styles.phoneRow}>
              <MaterialIcons name="email" size={13} color="#8896ab" style={{ marginRight: 4 }} />
              <Text style={styles.phone} numberOfLines={1}>{item.email}</Text>
            </View>
          ) : null}
        </View>

        {/* Preview eye — POS select-mode only. Sits just before the
            edit pencil so the cashier can verify the customer's
            details (incl. ID proofs) without leaving the picker. */}
        {isSelectMode ? (
          <TouchableOpacity
            style={[styles.editBtn, { marginRight: 6 }]}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={(e) => {
              e?.stopPropagation && e.stopPropagation();
              openPreview(item);
            }}
          >
            <MaterialIcons name="visibility" size={18} color={NAVY} />
          </TouchableOpacity>
        ) : null}

        <FeatureGate featureKey="customers.edit">
          <TouchableOpacity
            style={styles.editBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={(e) => {
              e?.stopPropagation && e.stopPropagation();
              primePartnerCache(item.id);
              navigation.navigate('CustomerInfo', { details: item });
            }}
          >
            <MaterialIcons name="edit" size={18} color={NAVY} />
          </TouchableOpacity>
        </FeatureGate>

        <MaterialIcons name="chevron-right" size={22} color="#cbd5e1" />
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <EmptyState
      imageSource={require('@assets/images/EmptyData/empty_data.png')}
      message={''}
    />
  );

  const renderContent = () => (
    <FlashList
      data={formatData(data, 1)}
      numColumns={1}
      renderItem={renderItem}
      keyExtractor={(item, index) => index.toString()}
      contentContainerStyle={{ padding: 8, paddingBottom: 80 }}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.2}
      ListFooterComponent={
        loading && <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 12 }} />
      }
      estimatedItemSize={80}
    />
  );

  const renderCustomers = () => {
    if (data.length === 0 && !loading) {
      return renderEmptyState();
    }
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Customers" onBackPress={() => navigation.goBack()} />
      <SearchContainer
        placeholder="Search Customers"
        onChangeText={handleSearchTextChange}
      />
      <RoundedContainer>
        {renderCustomers()}
        <FeatureGate featureKey="customers.add">
          <FABButton onPress={() => navigation.navigate('CustomerInfo')} />
        </FeatureGate>
      </RoundedContainer>

      {/* Preview modal — POS select-mode only. Shows the customer's
          summary + Front/Back ID proof cards (read-only). Edits go
          through CustomerInfo via the existing Edit pencil. */}
      <Modal
        visible={!!previewCustomer}
        animationType="slide"
        transparent
        onRequestClose={closePreview}
      >
        <View style={styles.previewBg}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {previewCustomer?.name || 'Customer'}
              </Text>
              <TouchableOpacity onPress={closePreview} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <MaterialIcons name="close" size={22} color="#1a1a2e" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 14 }} showsVerticalScrollIndicator={false}>
              {previewCustomer?.phone ? (
                <View style={styles.previewRow}>
                  <MaterialIcons name="phone" size={16} color="#8896ab" />
                  <Text style={styles.previewRowText}>{previewCustomer.phone}</Text>
                </View>
              ) : null}
              {previewCustomer?.email ? (
                <View style={styles.previewRow}>
                  <MaterialIcons name="email" size={16} color="#8896ab" />
                  <Text style={styles.previewRowText}>{previewCustomer.email}</Text>
                </View>
              ) : null}
              {previewCustomer?.address ? (
                <View style={styles.previewRow}>
                  <MaterialIcons name="place" size={16} color="#8896ab" />
                  <Text style={styles.previewRowText} numberOfLines={3}>{previewCustomer.address}</Text>
                </View>
              ) : null}

              <Text style={styles.previewSection}>ID PROOF</Text>
              {previewProof.loading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator color={NAVY} />
                </View>
              ) : (
                <IdProofCards
                  front={previewProof.front}
                  back={previewProof.back}
                  onChange={() => {}}
                  readOnly
                />
              )}
            </ScrollView>
            <TouchableOpacity style={styles.previewClose} activeOpacity={0.85} onPress={closePreview}>
              <Text style={styles.previewCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default CustomerScreen;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 4,
    marginVertical: 5,
    ...Platform.select({
      ios: {
        shadowColor: '#1a1a2e',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 18,
    color: '#1a1a2e',
  },
  info: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  name: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 15,
    color: NAVY,
    letterSpacing: 0.2,
  },
  // ID Proof pills — green-filled when uploaded, grey-outline when
  // missing. Wraps below the name on narrow screens so the longer
  // "ID Proof F / B" labels never truncate.
  proofPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  proofPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  proofPillOn: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  proofPillOff: {
    backgroundColor: '#fff',
    borderColor: '#D1D5DB',
  },
  proofPillText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  proofPillTextOn: { color: '#fff' },
  proofPillTextOff: { color: '#9CA3AF' },

  // Preview modal — POS select-mode only.
  previewBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  previewCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 22,
    maxHeight: '90%',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  previewTitle: {
    flex: 1,
    fontSize: 18,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
    marginRight: 12,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  previewRowText: {
    flex: 1,
    fontSize: 13,
    color: '#1a1a2e',
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  previewSection: {
    fontSize: 11,
    color: '#8896ab',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 8,
  },
  previewClose: {
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  previewCloseText: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  phone: {
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontSize: 12.5,
    color: '#8896ab',
    flexShrink: 1,
  },
  editBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#eef0f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
});
