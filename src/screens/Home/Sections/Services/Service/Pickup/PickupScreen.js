import React, { useEffect, useCallback } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { fetchPickup } from '@api/services/generalApi';
import { useDataFetching, useDebouncedSearch } from '@hooks';
import { useAuthStore } from '@stores/auth';
import { OverlayLoader } from '@components/Loader';
import PickupList from './PickupList';

const PickupScreen = ({ navigation }) => { 

  const isFocused = useIsFocused();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = currentUser?.related_profile?._id || '';
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchPickup);
  const { searchText, handleSearchTextChange } = useDebouncedSearch((text) => fetchData({ searchText: text }));

  useFocusEffect(
    useCallback(() => {
      fetchData({ loginEmployeeId: currentUserId, searchText });
    }, [currentUserId])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData({ loginEmployeeId: currentUserId, searchText });
    }
  }, [isFocused]);

  const handleLoadMore = () => {
    fetchMoreData({ loginEmployeeId: currentUserId, searchText });
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return <PickupList item={item} onPress={()=> navigation.navigate('PickupDetails', {id : item._id})} />;
  };

  const renderEmptyState = () => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message={'No Pick Ups Found'} />
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
      estimatedItemSize={100}
    />
  );

  const renderPickup = () => {
    if (data.length === 0 && !loading) {
      return renderEmptyState();
    }
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Pick Up"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedContainer>
      {renderPickup()}
      </RoundedContainer>
      <OverlayLoader visible={loading}  />
    </SafeAreaView>
  );
};

export default PickupScreen;
