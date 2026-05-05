import React, { useCallback, useEffect } from 'react'
import { useIsFocused, useFocusEffect } from '@react-navigation/native'
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { fetchDeliveryNote } from '@api/services/generalApi';
import { useDataFetching, useDebouncedSearch } from '@hooks';
import DeliveryNoteList from './DeliveryNoteList';
import { OverlayLoader } from '@components/Loader';

const DeliveryNoteScreen = ({ navigation }) => {

  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchDeliveryNote);
  const { searchText, handleSearchTextChange } = useDebouncedSearch((text) => fetchData({ searchText: text }));

  useFocusEffect(
    useCallback(() => {
      fetchData({searchText});
    },[searchText])
  )
  useEffect(() => {
    if (isFocused) {
      fetchData({ searchText });
    }
  }, [isFocused, searchText])

  const handleLoadMore = () => {
    fetchMoreData({ searchText });
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return <DeliveryNoteList item={item} onPress={() => navigation.navigate('DeliveryNoteDetails', { id: item._id })} />;
  };

  const renderEmptyState = () => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message={'No Delivery Note Found'} />
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

  const renderDeliveryNote = () => {
    if (data.length === 0 && !loading) {
      return renderEmptyState();
    }
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Delivery Note"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedContainer>
      {renderDeliveryNote()}
      </RoundedContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

export default DeliveryNoteScreen;