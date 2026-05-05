import React, { useEffect, useCallback } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { FABButton } from '@components/common/Button';
import { fetchPaymentMade } from '@api/services/generalApi';
import { useDataFetching } from '@hooks';
import { useAuthStore } from '@stores/auth';
import { OverlayLoader } from '@components/Loader';
import SupplierPaymentList from './SupplierPaymentList';

const SupplierPaymentScreen = ({ navigation }) => {

  const isFocused = useIsFocused();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = currentUser?.related_profile?._id || '';
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchPaymentMade);

  useFocusEffect(
    useCallback(() => {
      fetchData({ loginEmployeeId: currentUserId });
    }, [currentUserId])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData({ loginEmployeeId: currentUserId });
    }
  }, [isFocused]);

  const handleLoadMore = () => {
    fetchMoreData({ loginEmployeeId: currentUserId });
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return <SupplierPaymentList item={item} onPress={() => navigation.navigate('', { id: item._id })} />;
  };

  const renderEmptyState = () => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message={'No Payments Found'} />
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

  const rendorPayment = () => {
    if (data.length === 0 && !loading) {
      return renderEmptyState();
    }
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Payments Made"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedContainer>
      {rendorPayment()}
      <FABButton onPress={() => navigation.navigate('VendorBillFormTabs')} />
      </RoundedContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

export default SupplierPaymentScreen;