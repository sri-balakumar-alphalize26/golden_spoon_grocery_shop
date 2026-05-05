import React, { useState, useEffect } from 'react';
import { FlatList } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { ListItem } from '@components/Options';
import { formatData } from '@utils/formatters';
import { EmptyItem } from '@components/common/empty';
import { COLORS } from '@constants/theme';
import { useLoader } from '@hooks';
import { fetchProductDetailsByBarcode } from '@api/details/detailApi';
import { showToastMessage } from '@components/Toast';
import { OverlayLoader } from '@components/Loader';
import { ConfirmationModal } from '@components/Modal';
import { useAuthStore } from '@stores/auth';
import { post } from '@api/services/utils';

const OptionsScreen = ({ navigation }) => {
  const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);
  const [loading, startLoading, stopLoading] = useLoader(false);
  const [isLoading, setIsLoading] = useState(false);
  const currentUser = useAuthStore(state => state.user);

  const handleScan = async (code) => {
    startLoading();
    try {
      const productDetails = await fetchProductDetailsByBarcode(code);
      if (productDetails.length > 0) {
        const details = productDetails[0];
        navigation.navigate('ProductDetail', { detail: details });
      } else {
        showToastMessage('No Products found for this Barcode');
      }
    } catch (error) {
      showToastMessage(`Error fetching inventory details ${error.message}`);
    } finally {
      stopLoading();
    }
  };

  const options = [
    { title: 'Search Products', image: require('@assets/images/Home/options/search_product.png'), onPress: () => navigation.navigate('Products') },
    { title: 'Scan Barcode', image: require('@assets/images/Home/options/scan_barcode.png'), onPress: () => navigation.navigate("Scanner", { onScan: handleScan }) },
    { title: 'Product Enquiry', image: require('@assets/images/Home/options/product_enquiry.png'), onPress: () => navigation.navigate('PriceEnquiryScreen') },
    { title: 'Transaction Auditing', image: require('@assets/images/Home/options/transaction_auditing.png'), onPress: () => navigation.navigate('AuditScreen') },
    { title: 'CRM', image: require('@assets/images/Home/options/crm.png'), onPress: () => navigation.navigate('CRM') },
    { title: 'Purchases', image: require('@assets/images/Home/options/product_purchase_requisition.png'), onPress: () => navigation.navigate('PurchasesScreen') },
    { title: 'Vehicle Tracking', image: require('@assets/images/Home/options/customer_visit.png'), onPress: () => navigation.navigate('VehicleTrackingScreen') },
    { title: 'Task Manager', image: require('@assets/images/Home/options/tasK_manager_1.png'), onPress: () => navigation.navigate('TaskManagerScreen') },
    { title: 'Visits Plan', image: require('@assets/images/Home/options/visits_plan.png'), onPress: () => navigation.navigate('VisitsPlanScreen') },
    { title: 'Customer Visits', image: require('@assets/images/Home/options/customer_visit.png'), onPress: () => navigation.navigate('VisitScreen') },
    { title: 'Market Study', image: require('@assets/images/Home/options/market_study_1.png'), onPress: () => navigation.navigate('MarketStudyScreen') },
    { title: 'Attendance', image: require('@assets/images/Home/options/attendance.png'), onPress: () => navigation.navigate('AttendanceScreen') },
    { title: 'Inventory Management', image: require('@assets/images/Home/options/inventory_management_1.png'), onPress: () => navigation.navigate('InventoryScreen') },
    { title: 'Box Inspection', image: require('@assets/images/Home/options/box_inspection.png'), onPress: () => setIsConfirmationModalVisible(true) },
  ];

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return <ListItem title={item.title} image={item.image} onPress={item.onPress} />;
  };

  const handleBoxInspectionStart = async () => {
    setIsLoading(true);
    try {
      const boxInspectionGroupingData = {
        start_date_time: new Date(),
        sales_person_id: currentUser.related_profile?._id || null,
        warehouse_id: currentUser.warehouse?.warehouse_id || null,
      };
      const response = await post('/createBoxInspectionGrouping', boxInspectionGroupingData);
      if (response.success) {
        navigation.navigate('BoxInspectionScreen', { groupId: response?.data?._id })
      }
    } catch (error) {
      console.log('API Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader
        title="Options"
        color={COLORS.black}
        backgroundColor={COLORS.white}
        onBackPress={() => navigation.goBack()}
      />
      <RoundedContainer backgroundColor={COLORS.primaryThemeColor}>
        <FlatList
          data={formatData(options, 2)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
          renderItem={renderItem}
          numColumns={2}
          keyExtractor={(item, index) => index.toString()}
        />
        <OverlayLoader visible={loading || isLoading} />
      </RoundedContainer>

      <ConfirmationModal
        onCancel={() => setIsConfirmationModalVisible(false)}
        isVisible={isConfirmationModalVisible}
        onConfirm={() => {
          handleBoxInspectionStart();
          setIsConfirmationModalVisible(false);
        }}
        headerMessage='Are you sure that you want to start Box Inspection?'
      />
    </SafeAreaView>
  );
};

export default OptionsScreen;
