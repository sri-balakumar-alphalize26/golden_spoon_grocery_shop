import React, { useEffect, useCallback, useState } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { fetchCustomersOdoo } from '@api/services/generalApi';

import { useDataFetching, useDebouncedSearch } from '@hooks';
import Text from '@components/Text';
import {
  TouchableOpacity,
  ActivityIndicator,
  View,
  Image,
  StyleSheet,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { FABButton } from '@components/common/Button';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const AVATAR_TINTS = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8', '#fed7aa', '#ddd6fe', '#fecaca'];
const tintFor = (id) => AVATAR_TINTS[Math.abs(Number(id) || 0) % AVATAR_TINTS.length];

const CustomerScreen = ({ navigation, route }) => {
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchCustomersOdoo);
  const [failedImageIds, setFailedImageIds] = useState(() => new Set());

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text }),
    500
  );

  useFocusEffect(
    useCallback(() => {
      fetchData({ searchText });
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

        <TouchableOpacity
          style={styles.editBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={(e) => {
            e?.stopPropagation && e.stopPropagation();
            navigation.navigate('CustomerInfo', { details: item });
          }}
        >
          <MaterialIcons name="edit" size={18} color={NAVY} />
        </TouchableOpacity>

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
        <FABButton onPress={() => navigation.navigate('CustomerInfo')} />
      </RoundedContainer>
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
