import React, { useCallback, useEffect } from 'react'
import { useIsFocused, useFocusEffect } from '@react-navigation/native'
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { FABButton } from '@components/common/Button';
import { fetchPurchaseRequisition } from '@api/services/generalApi';
import { useDataFetching, useDebouncedSearch } from '@hooks';
import PurchaseRequisitionList from './PurchaseRequisitionList';
import { OverlayLoader } from '@components/Loader';

const PurchaseRequisitionScreen = ({ navigation }) => {

  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchPurchaseRequisition);
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
    return <PurchaseRequisitionList item={item} onPress={() => navigation.navigate('PurchaseRequisitionDetails', { id: item._id })} />;
  };

  const renderEmptyState = () => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message={'No Purchase Requisitions Found'} />
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

  const renderProductRequisition = () => {
    if (data.length === 0 && !loading) {
      return renderEmptyState();
    }
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Purchase Requisition"
        onBackPress={() => navigation.goBack()}
      />
      {/* <SearchContainer placeholder="Search Enquiries.." onChangeText={handleSearchTextChange} /> */}
      <RoundedContainer>
        {renderProductRequisition()}
        <FABButton onPress={() => navigation.navigate('PurchaseRequisitionForm')} />
      </RoundedContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

export default PurchaseRequisitionScreen;