import React, { useState, useEffect } from 'react';
import { FlatList, View, ActivityIndicator } from 'react-native';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import { fetchInvoiceDropdown, fetchPurchaseReturnDropdown, fetchSalesReturnDropdown, fetchServiceDropdown, fetchServiceReturnDropdown, fetchStockTransferDropdown, fetchVendorBillDropdown } from '@api/dropdowns/dropdownApi';
import InventoryRequestItem from './InventoryRequestItem';
import Text from '@components/Text';
import { styles } from './styles';
import { Button } from '@components/common/Button';
import { COLORS } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import axios from 'axios';
import INVENTORY_API_BASE from '@api/config/inventoryConfig';
import { useAuthStore } from '@stores/auth';
import Toast from 'react-native-toast-message';
import { OverlayLoader } from '@components/Loader';

const InventoryForm = ({ navigation, route }) => {
  const { inventoryDetails = {}, reason = {} } = route?.params || {};
console.log('Received Reason:', reason); // This will log the reason value

  // States for managing dropdown data and form data
  const [itemsList, setItemsList] = useState([]);
  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [chosenItem, setChosenItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const currentUser = useAuthStore((state) => state.user);

  const [formData, setFormData] = useState({
    reason: reason,
    sales: '',
    service: '',
    purchase: '',
    serviceReturn: '',
    purchaseReturn: '',
    salesReturn: '',
    stockTransfer: '',
    remarks: '',
  });

  const [dropdown, setDropdown] = useState({
    invoice: [],
    service: [],
    serviceReturn: [],
    purchaseReturn: [],
    salesReturn: [],
    stockTransfer: [],
    vendorBill: [],
  });

  // Fetch dropdown data for different categories
  useEffect(() => {
    const fetchData = async () => {
      try {
        const invoiceDropdown = await fetchInvoiceDropdown();
        const purchaseReturnDropdown = await fetchPurchaseReturnDropdown();
        const salesReturnDropdown = await fetchSalesReturnDropdown();
        const serviceDropdown = await fetchServiceDropdown();
        const serviceReturnDropdown = await fetchServiceReturnDropdown();
        const stockTransferDropdown = await fetchStockTransferDropdown();
        const vendorBillDropdown = await fetchVendorBillDropdown();

        setDropdown({
          invoice: invoiceDropdown.map((data) => ({ id: data._id, label: data.sequence_no })),
          purchaseReturn: purchaseReturnDropdown.map((data) => ({ id: data._id, label: data.sequence_no })),
          salesReturn: salesReturnDropdown.map((data) => ({ id: data._id, label: data.sequence_no })),
          service: serviceDropdown.map((data) => ({ id: data._id, label: data.sequence_no })),
          serviceReturn: serviceReturnDropdown.map((data) => ({ id: data._id, label: data.sequence_no })),
          stockTransfer: stockTransferDropdown.map((data) => ({ id: data._id, label: data.sequence_no })),
          vendorBill: vendorBillDropdown.map((data) => ({ id: data._id, label: data.sequence_no })),
        });
      } catch (error) {
        console.error('Error fetching dropdown data:', error);
      }
    };

    fetchData();
  }, []);

  // Update items list based on inventory details and reason (view or editing mode)
  useEffect(() => {
    setItemsList(
      inventoryDetails?.items.map((item) => ({
        ...item,
        quantity: reason.id === 'viewing' ? 0 : item.quantity === 0 ? 0 : 1,
        initialQuantity: item?.quantity,
      }))
    );
  }, [inventoryDetails?.items, reason.id]);

  // Automatically choose an item if only one item is in the list
  useEffect(() => {
    if (itemsList.length === 1) {
      handleChooseItem(itemsList[0]);
    }
  }, [itemsList]);

  // Handle change in form fields dynamically (e.g., service, sales, remarks)
  const handleFieldChange = (field, value) => {
    setFormData((prevFormData) => ({
      ...prevFormData,
      [field]: value,
    }));
  };

  // Filter items to display only the chosen item or all items
  const displayItems = chosenItem ? [chosenItem] : itemsList;
  const handleChooseItem = (item) => {
    // Toggle chosen state
    if (chosenItem === item) {
      setChosenItem(null);
    } else {
      setChosenItem({ ...item, chosen: true });
    }
  };

  // Handle the quantity change logic
  const handleQuantityChange = (id, text) => {
    if (!formData.reason) {
      showToastMessage('Please select a reason first.');
      return;
    }
    const newQuantity = parseInt(text) || 0;
    const maxQuantity = inventoryDetails?.items.find((dataItem) => dataItem._id === id)?.quantity;
    if (newQuantity > maxQuantity) {
      showToastMessage(`Please enter a quantity less than or equal to ${maxQuantity}`);
      return;
    }
    setItemsList((prevItems) =>
      prevItems.map((item) => (item._id === id ? { ...item, quantity: newQuantity } : item))
    );
  };
const handleInventoryBoxRequest = async () => {
  setLoading(true);
  try {
    // Log the inventoryDetails object to see its structure
    console.log("Inventory Details:", inventoryDetails);

    // Extract product_id from the first item in the items array (assuming each item has a product_id)
    const productId = inventoryDetails?.items?.[0]?.id || inventoryDetails?.items?.[0]?._id;

    // Check if productId exists
    if (!productId) {
      showToastMessage("Product ID is missing. Please check your inventory details.");
      return;
    }

    // Log the formData reason to ensure it's correct before sending the request
    console.log('FormData Reason:', formData.reason);  // Add this log to see what the reason value is

    // Prepare the payload
    const payload = {
      box_name: inventoryDetails?.name || inventoryDetails?.box_name,
      product_id: productId,  // Ensure product_id is included here
      warehouse_id: inventoryDetails?.warehouse_id || inventoryDetails?.warehouse?._id,
      quantity: chosenItem?.quantity || 1,
      reason: formData.reason?.label || reason?.label,  // Use label instead of name
      remark: formData.remarks || '',
    };

    console.log('Sending request to API:', { payload });  // Log the payload to check its structure

    const response = await axios.post(
      `${INVENTORY_API_BASE}/api/create_inventory_request`,
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log('Inventory request response:', response?.data || response);

    if (response?.data?.status === 'success') {
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: response.data.message || 'Inventory request created successfully',
        position: 'bottom',
      });
    } else {
      showToastMessage('Error creating inventory request');
    }
  } catch (error) {
    console.error('Error submitting request:', error);
  } finally {
    setLoading(false);
  }
};

  // Render dynamic form fields based on selected reason
  const renderDynamicField = () => {
    switch (formData.reason?.label?.toLowerCase()) {
      case 'sales':
        return (
          <FormInput
            labelColor={COLORS.boxTheme}
            label={'Select Sales'}
            placeholder={'Select Sales'}
            dropIcon={'menu-down'}
            editable={false}
            value={formData.sales?.label}
            onPress={() => toggleBottomSheet('Sales')}
          />
        );
      case 'service':
        return (
          <FormInput
            labelColor={COLORS.boxTheme}
            label={'Select Service'}
            placeholder={'Select Service'}
            dropIcon={'menu-down'}
            editable={false}
            value={formData.service?.label}
            onPress={() => toggleBottomSheet('Service')}
          />
        );
      case 'purchase':
        return (
          <FormInput
            labelColor={COLORS.boxTheme}
            label={'Select Purchase'}
            placeholder={'Select Purchase'}
            dropIcon={'menu-down'}
            editable={false}
            value={formData.purchase?.label}
            onPress={() => toggleBottomSheet('Purchase')}
          />
        );
      case 'purchase return':
        return (
          <FormInput
            labelColor={COLORS.boxTheme}
            label={'Select Purchase Return'}
            placeholder={'Select Purchase Return'}
            dropIcon={'menu-down'}
            editable={false}
            value={formData.purchaseReturn?.label}
            onPress={() => toggleBottomSheet('Purchase Return')}
          />
        );
      default:
        return null;
    }
  };

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedType) {
      case 'Sales':
        items = dropdown.invoice;
        fieldName = 'sales';
        break;
      case 'Service':
        items = dropdown.service;
        fieldName = 'service';
        break;
      case 'Purchase':
        items = dropdown.purchaseReturn;
        fieldName = 'purchaseReturn';
        break;
      case 'Sales Return':
        items = dropdown.salesReturn;
        fieldName = 'salesReturn';
        break;
      case 'Service Return':
        items = dropdown.serviceReturn;
        fieldName = 'serviceReturn';
        break;
      case 'Stock Transfer':
        items = dropdown.stockTransfer;
        fieldName = 'stockTransfer';
        break;
      default:
        return null;
    }
    return (
      <DropdownSheet
        isVisible={isVisible}
        items={items}
        title={selectedType}
        onClose={() => setIsVisible(false)}
        onValueChange={(value) => handleFieldChange(fieldName, value)}
      />
    );
  };

  return (
    <SafeAreaView backgroundColor={COLORS.boxTheme}>
      <NavigationHeader
        backgroundColor={COLORS.boxTheme}
        title={'Box Opening Request'}
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer>
        <OverlayLoader visible={loading} />
        <FormInput
          label={'Inventory Box'}
          labelColor={COLORS.boxTheme}
          editable={false}
          placeholder={'Box no'}
          value={inventoryDetails?.name || '-'}
        />
        <FormInput
          label={'Reason'}
          labelColor={COLORS.boxTheme}
          editable={false}
          placeholder={'Reason'}
          value={formData?.reason?.label || ''}
        />
        {renderDynamicField()}
        <Text style={styles.label}>Box Items</Text>
        <FlatList
          data={displayItems}
          numColumns={1}
          renderItem={({ item }) => (
            <InventoryRequestItem item={item} onChoose={() => handleChooseItem(item)} onQuantityChange={handleQuantityChange} />
          )}
          keyExtractor={(item) => item._id}
        />
        <FormInput
          label={'Remarks'}
          labelColor={COLORS.boxTheme}
          multiline={true}
          numberOfLines={5}
          placeholder={'Enter remarks'}
          onChangeText={(text) => handleFieldChange('remarks', text)}
        />
        <Button
          backgroundColor={loading ? COLORS.lightenBoxTheme : COLORS.boxTheme}
          title={'Submit'}
          disabled={loading}
          onPress={handleInventoryBoxRequest}
          style={styles.submitButton}
        />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default InventoryForm;
