import React, { useEffect, useCallback } from 'react';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
// import { FABButton } from '@components/common/Button';
import { fetchMarketStudy } from '@api/services/generalApi';
import { useDataFetching } from '@hooks';
import AnimatedLoader from '@components/Loader/AnimatedLoader';
import MarketStudyList from './MarketStudyList';

const MarketStudyScreen = ({ navigation }) => {
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchMarketStudy);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData();
    }
  }, [isFocused]);

  const handleLoadMore = () => {
    fetchMoreData();
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return <MarketStudyList item={item} />;
  };

  const renderEmptyState = () => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty_data.png')} message={''} />
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
        loading && (
          <AnimatedLoader
            visible={loading}
            animationSource={require('@assets/animations/loading.json')}
          />
        )
      }
      estimatedItemSize={100}
    />
  );

  const renderMarketStudy = () => {
    if (data.length === 0 && !loading) {
      return renderEmptyState();
    }
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Market Study"
        onBackPress={() => navigation.goBack()}
      />
      {/* <SearchContainer placeholder="Search Products" onChangeText={handleSearchTextChange} /> */}
      <RoundedContainer>
        {renderMarketStudy()}
        {/* <FABButton onPress={() => navigation.navigate('AuditForm')} /> */}
      </RoundedContainer>
    </SafeAreaView>
  );
};

export default MarketStudyScreen;
