import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { MaterialIcons } from '@expo/vector-icons';
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import useDataFetching from '@hooks/useDataFetching';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchStockProductsOdoo } from '@api/services/generalApi';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in_stock', label: 'In Stock' },
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'out_of_stock', label: 'Out of Stock' },
];

const AVATAR_TINTS = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#fed7aa', '#ddd6fe', '#fecaca'];
const tintFor = (id) => AVATAR_TINTS[Math.abs(Number(id) || 0) % AVATAR_TINTS.length];

const stateOf = (qty) => {
  if (qty <= 0) return { bg: '#FEE2E2', fg: '#B91C1C', label: 'Out' };
  if (qty <= 5) return { bg: '#FEF3C7', fg: '#92400E', label: 'Low' };
  return { bg: '#DCFCE7', fg: '#166534', label: 'In Stock' };
};

const StockScreen = ({ navigation }) => {
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchStockProductsOdoo);
  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, filter: filterRef.current }),
    400
  );

  const [filter, setFilter] = useState('all');
  const filterRef = useRef('all');
  const hasLoadedRef = useRef(false);
  const lastParamsRef = useRef({ searchText: '', filter: 'all' });
  const [failedImageIds, setFailedImageIds] = useState(() => new Set());

  useFocusEffect(
    useCallback(() => {
      const changed =
        lastParamsRef.current.searchText !== searchText ||
        lastParamsRef.current.filter !== filter;
      if (!hasLoadedRef.current || changed) {
        fetchData({ searchText, filter });
        hasLoadedRef.current = true;
        lastParamsRef.current = { searchText, filter };
      }
    }, [searchText, filter])
  );

  const handleFilterChange = (next) => {
    if (next === filter) return;
    filterRef.current = next;
    setFilter(next);
  };

  const handleLoadMore = () => fetchMoreData({ searchText, filter });

  const renderThumb = (item) => {
    if (!item.image_url || failedImageIds.has(item.id)) {
      const initial = (item.name || '?').trim().charAt(0).toUpperCase() || '?';
      return (
        <View style={[styles.thumb, { backgroundColor: tintFor(item.id), alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={styles.thumbInitial}>{initial}</Text>
        </View>
      );
    }
    return (
      <Image
        source={{ uri: item.image_url }}
        style={styles.thumb}
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

  const renderItem = useCallback(({ item }) => {
    const qty = item.qty_available;
    const badge = stateOf(qty);
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('StockDetail', { productId: item.id })}
      >
        {renderThumb(item)}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name || '—'}</Text>
          {item.default_code ? (
            <Text style={styles.code} numberOfLines={1}>{item.default_code}</Text>
          ) : null}
          <View style={[styles.statePill, { backgroundColor: badge.bg, marginTop: 4 }]}>
            <Text style={[styles.statePillText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
        </View>
        <View style={styles.qtyCol}>
          <Text style={[styles.qtyValue, { color: badge.fg }]}>{qty}</Text>
          {item.uom?.name ? <Text style={styles.qtyUom}>{item.uom.name}</Text> : null}
        </View>
        <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" />
      </TouchableOpacity>
    );
  }, [failedImageIds, navigation]);

  const keyExtractor = useCallback((item, index) => `stock-${item.id || index}`, []);

  const renderFilters = () => (
    <View style={styles.filterBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              activeOpacity={0.85}
              onPress={() => handleFilterChange(f.key)}
              style={[
                styles.filterPill,
                active && { backgroundColor: NAVY, borderColor: NAVY },
              ]}
            >
              <Text style={[styles.filterPillText, active && { color: '#fff' }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderList = () => {
    if (loading && (!data || data.length === 0)) return null;
    if ((!data || data.length === 0) && !loading) {
      return (
        <EmptyState
          imageSource={require('@assets/images/EmptyData/empty_data.png')}
          message="No stock found"
        />
      );
    }
    return (
      <FlashList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ padding: 8, paddingBottom: 60 }}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={92}
        ListFooterComponent={loading && data.length > 0 ? (
          <ActivityIndicator size="small" color={ORANGE} style={{ marginVertical: 16 }} />
        ) : null}
      />
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Stock" onBackPress={() => navigation.goBack()} />
      <SearchContainer
        placeholder="Search Stock"
        onChangeText={handleSearchTextChange}
        value={searchText}
      />
      <RoundedContainer>
        {renderFilters()}
        <View style={{ flex: 1 }}>
          {renderList()}
        </View>
      </RoundedContainer>
      <OverlayLoader visible={loading && (!data || data.length === 0)} />
    </SafeAreaView>
  );
};

export default StockScreen;

const styles = StyleSheet.create({
  filterBar: {
    height: 48,
    paddingTop: 6,
    paddingBottom: 6,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillText: {
    fontSize: 12,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 4,
    marginVertical: 5,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 2 },
    }),
  },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  thumbInitial: {
    fontSize: 20,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  name: {
    fontSize: 14,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  code: {
    fontSize: 12,
    color: '#8896ab',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 1,
  },
  statePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statePillText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },

  qtyCol: { alignItems: 'flex-end', marginRight: 6, minWidth: 56 },
  qtyValue: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  qtyUom: {
    fontSize: 11,
    color: '#8896ab',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 1,
  },
});
