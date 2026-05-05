// src/screens/Home/Options/CategoriesScreen.js

//import React, { useEffect, useCallback } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationHeader } from "@components/Header";
import { useDataFetching } from '@hooks';
import { fetchCategoriesOdoo } from "@api/services/generalApi"; // Correct import
import { SafeAreaView } from "@components/containers";
import { CategoryList } from "@components/Categories"; // Component to render each category
import { EmptyState } from "@components/common/empty"; // Empty state component
import { FlashList } from "@shopify/flash-list"; // FlashList for optimized scrolling


const CategoriesScreen = ({ navigation }) => {
  // Fetch categories using useDataFetching hook
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchCategoriesOdoo);

  // Fetch categories when screen is focused
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLoadMore = () => {
    fetchMoreData(); // Load more categories when reaching the bottom of the list
  };

  // Render each category using CategoryList component
  const renderItem = ({ item }) => {
    if (item.empty) {
      return <View style={[styles.itemStyle, styles.itemInvisible]} />;
    }
    return (
      <CategoryList
        item={item}
        onPress={() => navigation.navigate("Products", { id: item._id })} // Navigate to Products screen on category press
      />
    );
  };

  // Show empty state if no categories are available
  const renderEmptyState = () => (
    <EmptyState imageSource={require("@assets/images/EmptyData/empty_data.png")} message={"No categories available"} />
  );

  return (
    <SafeAreaView>
      <NavigationHeader title="Categories" onBackPress={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <FlashList
          data={data} // Display fetched categories
          renderItem={renderItem} // Render each category
          keyExtractor={(item) => item._id.toString()}
          onEndReached={handleLoadMore} // Trigger load more when end is reached
          onEndReachedThreshold={0.2}
          ListFooterComponent={loading && <ActivityIndicator size="large" color="#0000ff" />}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  itemInvisible: {
    backgroundColor: "transparent",
  },
  itemStyle: {
    flex: 1,
    alignItems: "center",
    margin: 6,
    borderRadius: 8,
    marginTop: 5,
    backgroundColor: "white",
  },
});

export default CategoriesScreen;//
