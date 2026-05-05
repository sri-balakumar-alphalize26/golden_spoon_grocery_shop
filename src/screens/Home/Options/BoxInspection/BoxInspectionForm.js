import React, { useState, useEffect, useCallback } from 'react';
import { Keyboard, View, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { showToast } from '@utils/common';
import { post } from '@api/services/utils';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { useAuthStore } from '@stores/auth';
import { formatDate } from '@utils/common/date';
import { validateFields } from '@utils/validation';
import { fetchInventoryDetails } from '@api/details/detailApi';
import NonInspectedBoxItems from './NonInspectedBoxItems';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { EmptyState } from '@components/common/empty';
import Text from '@components/Text';
import { useInspectionStore } from '@stores/box';

const BoxInspectionForm = ({ navigation, route }) => {
  const { params: { item: { boxId, boxName } = {} } = {} } = route;
  const currentUser = useAuthStore(state => state.user);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [boxItems, setBoxItems] = useState([])
  const { addInspectedId } = useInspectionStore();

  const [formData] = useState({
    date: new Date(),
    salesPerson: { id: currentUser?.related_profile?._id || '', label: currentUser?.related_profile?.name },
    warehouse: { id: currentUser?.warehouse?.warehouse_id || '', label: currentUser?.warehouse?.warehouse_name },
  });

  const [errors, setErrors] = useState({});

   // Fetch inventory box items when boxId changes
  useEffect(() => {
    if (boxId) {
      setLoading(true);
      const fetchInventoryBoxItems = async () => {
        try {
          const [boxItems] = await fetchInventoryDetails(boxId)
           // Map and initialize box items with default inspected quantity
          setBoxItems(boxItems?.items.map((item) => ({
            ...item,
            quantity: item.quantity,
            inspectedQuantity: 0
          })))

        } catch (error) {
          showToast({
            type: 'error',
            title: 'Error',
            message: 'Failed to fetch dropdown data. Please try again later.',
          });
        } finally {
          setLoading(false);
        }
      }
      fetchInventoryBoxItems()
    }
  }, [boxId, boxName])

  const renderEmptyState = () => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty_inventory_box.png')} message="Inspected items are empty" />
  );

   // Handle changes in inspected quantity input for each box item
  const handleQuantityChange = useCallback((id, text) => {
    const newQuantity = parseInt(text) || 0;
    setBoxItems((prevItems) =>
      prevItems.map((item) =>
        item._id === id
          ? { ...item, inspectedQuantity: newQuantity }
          : item
      )
    );
  }, []);

  const renderContent = () => (
    <FlatList
      data={boxItems || []}
      ListHeaderComponent={(<View><Text style={styles.label}>Inspected Items</Text></View>)}
      numColumns={1}
      renderItem={({ item }) => (
        <NonInspectedBoxItems
          item={item}
          onQuantityChange={(id, text) => handleQuantityChange(id, text)}
        />
      )}
      keyExtractor={(item, index) => index.toString()}
      showsVerticalScrollIndicator={false}
      estimatedItemSize={100}
    />
  );

  const validateForm = fieldsToValidate => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const handleSubmit = async () => {
    const fieldsToValidate = ['boxName'];
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      const requestPayload = {
        date: formData.date || null,
        box_id: boxId ?? null,
        sales_person_id: formData.salesPerson?.id || null,
        inspected_items: boxItems.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          box_quantity: item.quantity,
          inspected_quantity: item.inspectedQuantity,
          uom_id: item.uom_id || null,
          uom_name: item.uom_name || '',
        })),
        warehouse_id: formData.warehouse?.id || null,
      };
      try {
        const response = await post("/createBoxInspection", requestPayload);
        if (response.success) {
          const inspectedId = response.data?._id;
          addInspectedId(inspectedId);
          showToast({
            type: "success",
            title: "Success",
            message: response.message || "Box Inspection created successfully",
          });
          navigation.goBack();
        } else {
          showToast({
            type: "error",
            title: "ERROR",
            message: response.message || "Box Inspection failed",
          });
        }
      } catch (error) {
        showToast({
          type: "error",
          title: "ERROR",
          message: "An unexpected error occurred. Please try again later.",
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Add Box Inspection"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer>
        <FormInput
          label="Date"
          dropIcon="calendar"
          editable={false}
          value={formatDate(formData.date)}
        />
        <FormInput
          label="Warehouse"
          editable={false}
          required
          validate={errors.salesPerson}
          value={formData.warehouse?.label || ''}
          onPress={() => { }}
        />
        <FormInput
          label="Inspected By"
          editable={false}
          required
          validate={errors.salesPerson}
          value={formData.salesPerson?.label || ''}
          onPress={() => { }}
        />
        <FormInput
          label="Box Name"
          required
          placeholder="Select Box Name"
          editable={false}
          validate={errors.box}
          value={boxName || ''}
        />
        {boxItems?.length === 0 ? renderEmptyState() : renderContent()}
        <OverlayLoader visible={loading} />
        <LoadingButton title="SUBMIT" onPress={handleSubmit} loading={isSubmitting} marginTop={10} />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  label: {
    marginVertical: 5,
    fontSize: 16,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
})


export default BoxInspectionForm;
