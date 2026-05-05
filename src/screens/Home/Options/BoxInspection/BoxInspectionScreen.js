import React, { useCallback, useState, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { useAuthStore } from '@stores/auth';
import { OverlayLoader } from '@components/Loader';
import BoxInspectionList from './BoxInspectionList';
import { post, put } from '@api/services/utils';
import { showToast } from '@utils/common';
import { fetchNonInspectedBoxDropdown } from '@api/dropdowns/dropdownApi';
import { fetchInventoryDetails } from '@api/details/detailApi';
import { formatData } from '@utils/formatters';
import { ConfirmationModal } from '@components/Modal';
import { BackHandler } from 'react-native';
import { useInspectionStore } from '@stores/box';

const BoxInspectionScreen = ({ navigation, route }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const currentUser = useAuthStore(state => state.user);
  const warehouseId = currentUser?.warehouse?.warehouse_id || '';
  const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);
  const { inspectedIds, resetInspectedIds } = useInspectionStore();

  const { groupId } = route?.params || {};

  useEffect(() => {
    const onBackPress = () => {
      setIsConfirmationModalVisible(true);
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );

    return () => backHandler.remove();
  }, []);

  const fetchNonInspectedBoxList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchNonInspectedBoxDropdown(warehouseId);
      setData(
        response.map(({ box_id, box_name }) => ({
          boxId: box_id,
          boxName: box_name,
        }))
      );
    } catch (error) {
      console.error('Failed to fetch non-inspected box list:', error);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useFocusEffect(
    useCallback(() => {
      fetchNonInspectedBoxList();
    }, [fetchNonInspectedBoxList])
  );
  // navigate only after open inventory request create successfully
  const handleNavigateToForm = useCallback(
    async (item) => {
      if (!item?.boxId) return;

      setLoading(true);
      try {
        const [boxItems] = await fetchInventoryDetails(item.boxId);
        const formattedItems = boxItems?.items.map(item => ({
          ...item,
          quantity: 0,
        }));

        const requestPayload = {
          items: formattedItems,
          quantity: 0,
          reason: 'inspection',
          box_id: item.boxId,
          sales_person_id: currentUser.related_profile?._id || null,
          box_status: 'pending',
          request_status: 'requested',
          warehouse_name: currentUser.warehouse?.warehouse_name || '',
          warehouse_id: currentUser.warehouse?.warehouse_id,
        };
        const response = await post('/createInventoryBoxRequest', requestPayload);
        if (response.success === false) {
          navigation.navigate('BoxInspectionForm', { item, groupId });
        } else {
          showToast({ type: 'error', title: 'Error', message: "You don't have permission to open this box." });
        }
      } catch (err) {
        showToast({ type: 'error', title: 'Error', message: 'Failed to fetch box details. Please try again later.' });
      } finally {
        setLoading(false);
      }
    },
    [currentUser, navigation]
  );

  const handleUpdateBoxInspectionGrouping = async () => {
    try {
      const requestPayload = {
        box_inspection_grouping_id: groupId,
        end_date_time: new Date(),
        box_inspection_id: inspectedIds,
      };
      const response = await put('/updateBoxInspectionGrouping', requestPayload);
      if (response.success) {
        resetInspectedIds(); 
        navigation.goBack();
      }
    } catch (error) {
      console.error('Failed to update box inspection grouping:', error);
    }
  };

  const renderItem = useCallback(
    ({ item }) =>
      item.empty ? <EmptyItem /> : <BoxInspectionList item={item} onPress={() => handleNavigateToForm(item)} />,
    [handleNavigateToForm]
  );

  const renderEmptyState = useCallback(
    () => <EmptyState imageSource={require('@assets/images/EmptyData/empty_inventory_box.png')} />,
    []
  );

  const renderContent = useCallback(
    () => (
      <FlashList
        data={formatData(data, 4)}
        numColumns={4}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item.boxId}-${index}`}
        contentContainerStyle={{ paddingBottom: 50, padding: 10 }}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={100}
      />
    ),
    [data, renderItem]
  );

  const handleBackPress = () => {
    setIsConfirmationModalVisible(true);
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Box Inspection"
        onBackPress={handleBackPress}
      />
      <SearchContainer placeholder="Search Boxes..." onChangeText={() => { }} />
      <RoundedContainer>
        {data.length === 0 && !loading ? renderEmptyState() : renderContent()}
      </RoundedContainer>

      <ConfirmationModal
        isVisible={isConfirmationModalVisible}
        onCancel={() => setIsConfirmationModalVisible(false)}
        onConfirm={() => {
          handleUpdateBoxInspectionGrouping();
          setIsConfirmationModalVisible(false);
        }}
        headerMessage="Are you sure that you completed the box inspection?"
      />
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

export default BoxInspectionScreen;
