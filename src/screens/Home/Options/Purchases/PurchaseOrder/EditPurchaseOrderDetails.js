import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, FlatList, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { TitleWithButton, NavigationHeader } from "@components/Header";
import { RoundedScrollContainer } from '@components/containers';
import { DropdownSheet } from "@components/common/BottomSheets";
import { TextInput as FormInput } from '@components/common/TextInput';
import { formatDate } from '@utils/common/date';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { showToastMessage } from '@components/Toast';
import { fetchSupplierDropdown, fetchCurrencyDropdown, fetchCountryDropdown, fetchWarehouseDropdown } from "@api/dropdowns/dropdownApi";
import { purchaseType } from "@constants/dropdownConst";
import { fetchPurchaseOrderDetails } from '@api/details/detailApi';
import EditPurchaseOrderList from './EditPurchaseOrderList';
import { OverlayLoader } from '@components/Loader';
import { Button } from '@components/common/Button';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { put } from '@api/services/utils';
import { showToast } from '@utils/common';

const EditPurchaseOrderDetails = ({ navigation, route }) => {
  const { id: purchaseOrderId } = route?.params || {};
  console.log("Purchase Order ID:", purchaseOrderId)
  const [details, setDetails] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [purchaseOrderLines, setPurchaseOrderLines] = useState([]);
  // console.log("Purchase Order Lines :", purchaseOrderLines)
  const [isVisible, setIsVisible] = useState(false);
  const [deletePurchaseLine, setDeletePurchaseLine] = useState([]);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({});
  const [searchText, setSearchText] = useState("");
  const [dropdown, setDropdown] = useState({
    vendorName: [],
    currency: [],
    purchaseType: [],
    countryOfOrigin: [],
    warehouse: [],
  });

  const fetchDetails = async (purchaseOrderId) => {
    setIsLoading(true);
    try {
      const [details] = await fetchPurchaseOrderDetails(purchaseOrderId);
      if (details) {
        setFormData((prevFormData) => ({
          ...prevFormData,
          vendorName: { id: details?.supplier?.supplier_id || '', label: details?.supplier?.supplier_name?.trim() || '' },
          trnNumber: details?.Trn_number.toString() || '-',
          currency: { id: details?.currency?.currency_id || '', label: details?.currency?.currency_name || '' },
          orderDate: details?.order_date || new Date(),
          purchaseType: details?.purchase_type || '',
          countryOfOrigin: { id: details?.country?.country_id || '', label: details?.country?.country_name || '' },
          billDate: details?.bill_date || null,
          warehouse: { id: details?.warehouse_id || '', label: details?.warehouse_name || '' },
        }));
        setDetails(details);
        setPurchaseOrderLines(details?.products_lines || []);
      } else {
        console.warn('No valid data received for purchase order details.');
        setFormData(null);
        setPurchaseOrderLines([]);
        showToastMessage({
          type: 'warning',
          title: 'Warning',
          message: 'No details found for the specified purchase order.',
        });
      }
    } catch (error) {
      console.error('Error fetching purchase order details:', error);
      setFormData(null);
      setPurchaseOrderLines([]);
      showToastMessage({
        type: 'error',
        title: 'Error',
        message: 'Failed to fetch purchase order details. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const fetchSuppliers = async () => {
      if (selectedType === "Vendor Name") {
        try {
          const vendorData = await fetchSupplierDropdown(searchText);
          setDropdown((prevDropdown) => ({
            ...prevDropdown,
            vendorName: vendorData?.map((data) => ({
              id: data._id,
              label: data.name?.trim(),
            })),
          }));
        } catch (error) {
          console.error("Error fetching Supplier dropdown data:", error);
        }
      }
    };
    fetchSuppliers();
  }, [searchText, selectedType]);

  useFocusEffect(
    useCallback(() => {
      if (purchaseOrderId) {
        fetchDetails(purchaseOrderId);
        // } else {
        //   console.log("No Purchase Order ID found");
      }
    }, [purchaseOrderId])
  );

  useEffect(() => {
    if (route.params?.newProductLine) {
      addProducts(route.params.newProductLine);
    }
  }, [route.params?.newProductLine]);

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [currencyData, countryData, warehouseData] = await Promise.all([
          fetchCurrencyDropdown(),
          fetchCountryDropdown(),
          fetchWarehouseDropdown(),
        ]);
        setDropdown({
          currency: currencyData.map(data => ({
            id: data._id,
            label: data.currency_name,
          })),
          countryOfOrigin: countryData.map(data => ({
            id: data._id,
            label: data.country_name,
          })),
          warehouse: warehouseData.map(data => ({
            id: data._id,
            label: data.warehouse_name,
          })),
        });
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
      }
    };

    fetchDropdownData();
  }, []);

  const handleFieldChange = (field, value) => {
    setFormData((prevFormData) => ({ ...prevFormData, [field]: value }));
    if (errors[field]) {
      setErrors((prevErrors) => ({ ...prevErrors, [field]: null }));
    }
  };

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const addProducts = (addedItem) => {
    const structuredProduct = {
      product_id: addedItem.product_id,
      product_name: addedItem.product_name,
      description: addedItem.description || "",
      quantity: addedItem.quantity,
      uom_id: addedItem.uom.id,
      uom: addedItem.uom.label,
      product_unit_of_measure: addedItem.uom.label,
      unit_price: addedItem.unitPrice,
      scheduled_date: addedItem.scheduledDate,
      tax_type_id: addedItem.taxes.id,
      tax_type_name: addedItem.taxes.label,
      sub_total: addedItem.subTotal,
      untaxed_amount: addedItem.untaxedAmount,
      tax: parseFloat(addedItem.tax),
      total: parseFloat(addedItem.totalAmount),
    };
    setPurchaseOrderLines((prevItems) => [...prevItems, structuredProduct]);
  };

  const handleDelete = (id) => {
    setDeletePurchaseLine((prevIds) => [...prevIds, id]);
    setPurchaseOrderLines((prevLines) =>
      prevLines.filter((line) => line._id !== id)
    );
  };

  const handleUpdatePurchaseOrder = async () => {
    setIsSubmitting(true);
    try {
      const updatePurchaseLineIds = purchaseOrderLines
        .filter((item) => item._id)
        .map((item) => ({
          purchase_line_ids: item._id,
          product: item.product.product_id,
          taxes: item.taxes.tax_type_id,
          quantity: item.quantity,
          recieved_quantity: item.recieved_quantity || 0,
          unit_price: item.unit_price,
          sub_total: item.sub_total,
          description: item.description,
          billed_quantity: item.billed_quantity || 0,
          product_unit_of_measure: item.product_unit_of_measure,
          scheduled_date: item.scheduled_date,
        }));

      const createPurchaseLineIds = purchaseOrderLines
        .filter((item) => !item._id)
        .map((item) => ({
          product: item.product_id,
          taxes: item.tax_type_id,
          quantity: item.quantity,
          recieved_quantity: item.recieved_quantity || 0,
          unit_price: item.unit_price,
          sub_total: item.sub_total,
          description: item.description,
          billed_quantity: item.billed_quantity || 0,
          product_unit_of_measure: item.product_unit_of_measure,
          scheduled_date: item.scheduled_date,
        }));

      const deletePurchaseLineIds = deletePurchaseLine;

      const updatedPurchaseOrder = {
        _id: "678f9d98302b090a0cfab6e1",
        supplier: formData?.vendorName?.id ?? null,
        Trn_number: formData?.trnNumber || null,
        status: "Pending",
        currency: formData?.currency?.id ?? null,
        purchase_type: formData?.purchaseType || null,
        country: formData?.countryOfOrigin?.id ?? null,
        bill_date: formatDate(formData.billDate, 'yyyy-MM-dd') || null,
        order_date: formatDate(formData.orderDate, 'yyyy-MM-dd') || null,
        untaxed_total_amount: untaxedTotal || null,
        total_amount: grandTotal || null,
        payment_status: "Pending",
        due_amount: 0,
        paid_amount: 0,
        due_date: 0,
        remarks: formData?.remarks || "No remarks",
        date: formatDate(formData.billDate, 'yyyy-MM-dd') || null,
        warehouse_id: formData?.warehouse?.id ?? null,
        warehouse_name: formData?.warehouse?.label ?? null,
        update_purchase_line_ids: updatePurchaseLineIds,
        create_purchase_line_ids: createPurchaseLineIds,
        delete_purchase_line_ids: deletePurchaseLineIds
      };
      console.log("Updated Purchase Order:", updatedPurchaseOrder);
      const response = await put("/updatePurchaseOrder", updatedPurchaseOrder);
      if (response.message === "Succesfully updated Purchase order") {
        showToast({
          type: "success",
          title: "Success",
          message: "Purchase Order Updated Successfully",
        });
        navigation.navigate("PurchaseOrderScreen");
      } else {
        throw new Error(response.message || "Failed to update Purchase Order");
      }
    } catch (error) {
      console.error("Error Submitting Purchase Order Update:", error);
      showToast({
        type: "error",
        title: "Error",
        message: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = "";

    switch (selectedType) {
      case "Vendor Name":
        items = dropdown.vendorName;
        fieldName = "vendorName";
        break;
      case "Currency":
        items = dropdown.currency;
        fieldName = "currency";
        break;
      case "Purchase Type":
        items = purchaseType;
        fieldName = "purchaseType";
        break;
      case "Country Of Origin":
        items = dropdown.countryOfOrigin;
        fieldName = "countryOfOrigin";
        break;
      case "Warehouse":
        items = dropdown.warehouse;
        fieldName = "warehouse";
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
        search={selectedType === "Vendor Name"}
        onSearchText={(value) => setSearchText(value)}
        onValueChange={(value) => {
          setSearchText("");
          handleFieldChange(fieldName, value);
          setIsVisible(false);
        }}
      />
    );
  };

  const { untaxedTotal, taxTotal, grandTotal } = useMemo(() => {
    let taxes = 0;
    let untaxed = 0;
    purchaseOrderLines.forEach((item) => {
      untaxed += item.sub_total || 0;
      taxes += item.tax_value || item.tax || 0;
    });
    return {
      untaxedTotal: untaxed.toFixed(2),
      taxTotal: taxes.toFixed(2),
      grandTotal: (untaxed + taxes).toFixed(2),
    };
  }, [purchaseOrderLines]);


  return (
    <SafeAreaView>
      <NavigationHeader
        title={'Edit Purchase Order Details'}
        onBackPress={() => navigation.goBack()}
        logo={false}
      />
      <RoundedScrollContainer>
        <FormInput
          label="Vendor Name"
          placeholder="Select Vendor Name"
          dropIcon="menu-down"
          editable={false}
          validate={errors.vendorName}
          value={formData.vendorName?.label}
          required
          multiline={true}
          onPress={() => toggleBottomSheet("Vendor Name")}
        />
        <FormInput
          label="TRN Number"
          placeholder="Enter Transaction Number"
          editable
          keyboardType="numeric"
          validate={errors.trnNumber}
          value={formData.trnNumber}
          required
          onChangeText={(value) => handleFieldChange('trnNumber', value)}
        />
        <FormInput
          label="Currency"
          placeholder="Select Currency"
          dropIcon="menu-down"
          editable={false}
          validate={errors.currency}
          value={formData.currency?.label}
          required
          onPress={() => toggleBottomSheet("Currency")}
        />
        <FormInput
          label="Order Date"
          editable={false}
          value={formatDate(formData.orderDate)}
        />
        <FormInput
          label="Purchase Type"
          placeholder="Select Purchase Type"
          dropIcon="menu-down"
          items={purchaseType}
          editable={false}
          validate={errors.purchaseType}
          value={formData.purchaseType}
          required
          onPress={() => toggleBottomSheet("Purchase Type")}
        />
        <FormInput
          label="Country Of Origin"
          placeholder="Select Country"
          dropIcon="menu-down"
          editable={false}
          validate={errors.countryOfOrigin}
          value={formData.countryOfOrigin?.label}
          required
          onPress={() => toggleBottomSheet("Country Of Origin")}
        />
        <FormInput
          label="Bill Date"
          dropIcon="calendar"
          placeholder="dd-mm-yyyy"
          editable={false}
          required
          validate={errors.billDate}
          value={formatDate(formData.billDate)}
          onPress={() => setIsDatePickerVisible(true)}
        />
        <FormInput
          label="Warehouse"
          placeholder="Select Warehouse"
          dropIcon="menu-down"
          editable={false}
          validate={errors.warehouse}
          value={formData.warehouse?.label}
          required
          onPress={() => toggleBottomSheet("Warehouse")}
        />
        <TitleWithButton
          label="Add an item"
          onPress={() => navigation.navigate('AddEditPurchaseLines', { id: purchaseOrderId })}
        />
        <FlatList
          data={purchaseOrderLines}
          renderItem={({ item }) =>
            <EditPurchaseOrderList
              item={item}
              onPress={() => navigation.navigate('EditPurchaseLines', { id: item._id })}
              onDeletePress={() => handleDelete(item?._id)} />}
          keyExtractor={(item) => item._id}
        />

        <View style={{ marginVertical: 2 }}>
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Untaxed Amount : </Text>
            <Text style={styles.totalValue}>{untaxedTotal}</Text>
          </View>
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Taxes : </Text>
            <Text style={styles.totalValue}>{taxTotal}</Text>
          </View>
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total : </Text>
            <Text style={styles.totalValue}>{grandTotal}</Text>
          </View>
        </View>
        {renderBottomSheet()}
        <Button
          backgroundColor={COLORS.primaryThemeColor}
          title="UPDATE"
          onPress={handleUpdatePurchaseOrder}
        />

        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          minimumDate={new Date()}
          onConfirm={(date) => {
            setIsDatePickerVisible(false);
            handleFieldChange("billDate", date);
          }}
          onCancel={() => setIsDatePickerVisible(false)}
        />

      </RoundedScrollContainer>
      <OverlayLoader visible={isLoading || isSubmitting} />
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
  totalSection: {
    flexDirection: 'row',
    marginVertical: 5,
    margin: 10,
    alignSelf: "center",
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  totalValue: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#666666',
  },
});

export default EditPurchaseOrderDetails;