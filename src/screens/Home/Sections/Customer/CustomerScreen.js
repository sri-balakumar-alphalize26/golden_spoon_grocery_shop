import React, { useEffect, useCallback } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
// 🔹 changed this line
import { fetchCustomersOdoo } from '@api/services/generalApi';

import { useDataFetching, useDebouncedSearch } from '@hooks';
import Text from '@components/Text';
import { TouchableOpacity, ActivityIndicator, View, Image } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { Button, FABButton } from '@components/common/Button';

const CustomerScreen = ({ navigation, route }) => {
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchCustomersOdoo);

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

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          // If opened in select mode, call the provided callback and go back
          if (route?.params?.selectMode && typeof route.params.onSelect === 'function') {
            route.params.onSelect(item);
            navigation.goBack();
            return;
          }
          navigation.navigate('CustomerDetails', { details: item });
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', margin: 5 }}>
          <Image
            source={require('@assets/icons/common/user_bg.png')}
            tintColor={COLORS.primaryThemeColor}
            style={{ width: 45, height: 45 }}
          />
          <View style={{ width: 10 }} />
          <Text
            style={{
              fontFamily: FONT_FAMILY.urbanistBold,
              fontSize: 14,
              flex: 1,
              color: COLORS.primaryThemeColor,
            }}
          >
            {item?.name?.trim() || '-'}
          </Text>
        </View>
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
      contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.2}
      ListFooterComponent={
        loading && <ActivityIndicator size="large" color={COLORS.orange} />
      }
      estimatedItemSize={100}
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
        <FABButton onPress={() => navigation.navigate('CustomerFormTabs')} />
      </RoundedContainer>
    </SafeAreaView>
  );
};

export default CustomerScreen;
