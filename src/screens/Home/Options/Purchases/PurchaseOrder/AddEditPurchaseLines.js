import React, { useEffect, useState } from "react";
import { RoundedScrollContainer, SafeAreaView } from "@components/containers";
import { NavigationHeader } from "@components/Header";
import { TextInput as FormInput } from "@components/common/TextInput";
import { Button } from "@components/common/Button";
import { DropdownSheet } from "@components/common/BottomSheets";
import { COLORS } from "@constants/theme";
import { fetchProductsDropdown, fetchUnitOfMeasureDropdown, fetchTaxDropdown } from "@api/dropdowns/dropdownApi";
import { Keyboard } from "react-native";
import { validateFields } from '@utils/validation';
import { formatDate } from '@utils/common/date';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useAuthStore } from "@stores/auth";
import { showToastMessage } from "@components/Toast";

const AddEditPurchaseLines = ({ navigation, route }) => {
  // const currentUser = useAuthStore(state => state.user);
  const { id: purchaseOrderId } = route?.params || {};
  const [searchText, setSearchText] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [errors, setErrors] = useState({});
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);

  const [dropdown, setDropdown] = useState({
    products: [],
    unitofmeasure: [],
    taxes: [],
  });

  const [formData, setFormData] = useState({
    productId: '',
    productName: '',
    description: '',
    scheduledDate: new Date(),
    quantity: '',
    receivedQuantity: '', 
    billedQuantity: '',
    uom: '',
    unitPrice: '',
    taxes: '',
    subTotal: '',
    totalAmount: ''
  });

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const productsData = await fetchProductsDropdown(searchText);
        setDropdown((prevDropdown) => ({
          ...prevDropdown,
          products: productsData?.map((data) => ({
            id: data._id,
            label: data.product_name?.trim(),
            product_description: data.product_description,
            cost: data.cost,
          })),
        }));
      } catch (error) {
        console.error("Error fetching Products dropdown data:", error);
      }
    };

    fetchProducts();
  }, [searchText]);

  useEffect(() => {
    const fetchUnitOfMeasure = async () => {
      try {
        const UnitOfMeasureData = await fetchUnitOfMeasureDropdown();
        const uomItems = UnitOfMeasureData.map(data => ({
          id: data._id,
          label: data.uom_name,
        }));

        const defaultUOM = uomItems.find(uom => uom.label === 'Pcs');
        setDropdown(prevDropdown => ({
          ...prevDropdown,
          unitofmeasure: uomItems,
        }));

        if (defaultUOM) {
          setFormData(prevFormData => ({
            ...prevFormData,
            uom: defaultUOM,
          }));
        }
      } catch (error) {
        console.error('Error fetching Unit Of Measure dropdown data:', error);
      }
    };

    fetchUnitOfMeasure();
  }, []);

  useEffect(() => {
    const fetchTax = async () => {
      try {
        const taxData = await fetchTaxDropdown();
        setDropdown(prevDropdown => ({
          ...prevDropdown,
          taxes: taxData.map(data => ({
            id: data._id,
            label: data.tax_type_name,
          })),
        }));
      } catch (error) {
        console.error('Error fetching tax dropdown data:', error);
      }
    };

    fetchTax();
  }, []);

  useEffect(() => {
    const calculateTaxAndTotal = () => {
      const untaxedAmount = parseFloat(formData.subTotal) || 0;
      let tax = 0;

      if (formData.taxes?.label === "vat 5%") {
        tax = untaxedAmount * 0.05;
      } else if (formData.taxes?.label === "vat 5% inclusive") {
        tax = untaxedAmount * 0.05;
      } else if (formData.taxes?.label === "vat 0%") {
        tax = 0;
      }

      const totalAmount = untaxedAmount + tax;
      setFormData((prevFormData) => ({
        ...prevFormData,
        tax: tax.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
      }));
    };

    calculateTaxAndTotal();
  }, [formData.subTotal, formData.taxes]);

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const validateForm = (fieldsToValidate) => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const handleQuantityChange = (value) => {
    const quantity = parseFloat(value);
    setFormData((prevFormData) => ({
      ...prevFormData,
      quantity,
      subTotal: quantity > 0 ? quantity * (prevFormData.unitPrice || 0) : 0,
    }));
  };

  const handleFieldChange = (field, value) => {
    setFormData((prevFormData) => ({
      ...prevFormData,
      [field]: value,
    }));
    if (errors[field]) {
      setErrors((prevErrors) => ({
        ...prevErrors,
        [field]: null,
      }));
    }
  };

  const handleProductSelection = (selectedProduct) => {
    setFormData((prevFormData) => ({
      ...prevFormData,
      productId: selectedProduct.id,
      productName: selectedProduct.label,
      description: selectedProduct.product_description || '',
      unitPrice: selectedProduct.cost || '',
      subTotal: (selectedProduct.cost) * (prevFormData.quantity),
    }));
    setIsVisible(false);
  };

  const handleAddProducts = () => {
    const fieldsToValidate = ['productName'];
    if (formData.quantity === '' || formData.quantity === undefined || formData.quantity === null) {
      showToastMessage('Quantity is required');
      return;
    }
    if (Number(formData.quantity) <= 0) {
      showToastMessage('Quantity should be greater than 0');
      return;
    }    
    if (formData.taxes === '' || formData.taxes === undefined || formData.taxes === null) {
      showToastMessage('Tax is required');
      return;
    }
    if (validateForm(fieldsToValidate)) {
      const purchaseOrderLines = {
        product_id: formData.productId,
        product_name: formData.productName,
        description: formData.description || '',
        scheduledDate: formatDate(formData.scheduledDate || ''),
        quantity: formData.quantity || '',
        receivedQuantity: formData.receivedQuantity || '',
        billedQuantity: formData.billedQuantity || '',
        uom: formData.uom || '',
        unitPrice: formData.unitPrice || '',
        taxes: formData.taxes || '',
        subTotal: formData.subTotal || '',
        untaxedAmount: formData.subTotal || '',
        tax: formData.tax || '',
        totalAmount: formData.totalAmount || '',
      };
      // // console.log("🚀 ~ AddEditPurchaseLines ~ purchaseOrderLines:", JSON.stringify(purchaseOrderLines, null, 2));
      navigation.navigate('EditPurchaseOrderDetails', { purchaseOrderId, newProductLine: purchaseOrderLines });
      // navigation.navigate('EditPurchaseOrderDetails', { newProductLine: purchaseOrderLines });
    }
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedType) {
      case 'Product Name':
        items = dropdown.products;
        fieldName = 'products';
        break;
      case 'UOM':
        items = dropdown.unitofmeasure;
        fieldName = 'uom';
        break;
      case 'Tax':
        items = dropdown.taxes;
        fieldName = 'taxes';
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
        search={selectedType === "Product Name"}
        onSearchText={(value) => setSearchText(value)}
        onValueChange={(value) => {
          setSearchText('')
          if (selectedType === 'Product Name') {
            handleProductSelection(value);
          } else {
            handleFieldChange(fieldName, value);
          }
        }}
      />
    );
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Add Products"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer>
        <FormInput
          label="Product Name"
          placeholder="Select Product Name"
          dropIcon="menu-down"
          editable={false}
          required
          multiline={true}
          validate={errors.productName}
          value={formData.productName}
          onPress={() => toggleBottomSheet('Product Name')}
        />
        <FormInput
          label="Description"
          placeholder="Enter Description"
          value={formData.description}
          onChangeText={(value) => handleFieldChange('description', value)}
        />
        <FormInput
          label="Scheduled Date"
          dropIcon="calendar"
          placeholder={"dd-mm-yyyy"}
          editable={false}
          value={formatDate(formData.scheduledDate)}
          onPress={() => setIsDatePickerVisible(true)}
        />
        <FormInput
          label="Quantity"
          placeholder="Enter Quantity"
          keyboardType="numeric"
          value={formData.quantity}
          onChangeText={(value) => handleQuantityChange(value)}
        />
        <FormInput
          label="Received Quantity"
          placeholder="Enter Received Quantity"
          keyboardType="numeric"
          value={formData.receivedQuantity}
          onChangeText={(value) => handleQuantityChange(value)}
        />
        <FormInput
          label="Billed Quantity"
          placeholder="Enter Billed Quantity"
          keyboardType="numeric"
          value={formData.billedQuantity}
          onChangeText={(value) => handleQuantityChange(value)}
        />
        <FormInput
          label="Product Unit Of Measure"
          placeholder="Unit Of Measure"
          dropIcon="menu-down"
          editable={false}
          value={formData.uom?.label || ''}
          onPress={() => toggleBottomSheet('UOM')}
        />
        <FormInput
          label="Unit Price"
          placeholder="Unit Price"
          editable={false}
          value={formData.unitPrice.toString()}
          onChangeText={(value) => handleFieldChange('unitPrice', parseFloat(value))}
        />
        <FormInput
          label="Tax"
          placeholder="Select Tax Type"
          dropIcon="menu-down"
          editable={false}
          validate={errors.taxes}
          value={formData.taxes?.label}
          onPress={() => toggleBottomSheet('Tax')}
        />
        <FormInput
          label="Sub Total"
          placeholder="Sub Total"
          editable={false}
          value={formData.subTotal.toString()}
        />
        <FormInput
          label="Untaxed Amount"
          editable={false}
          value={formData.subTotal.toString()}
        />
        <FormInput
          label="Taxes"
          editable={false}
          value={formData.tax}
        />
        <FormInput
          label="Total"
          editable={false}
          value={formData.totalAmount}
        />

        {renderBottomSheet()}
        <Button
          title="Add Product"
          width="50%"
          alignSelf="center"
          backgroundColor={COLORS.primaryThemeColor}
          onPress={handleAddProducts}
        />
        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          minimumDate={new Date()}
          onConfirm={(date) => {
            setIsDatePickerVisible(false);
            handleFieldChange("scheduledDate", date);
          }}
          onCancel={() => setIsDatePickerVisible(false)}
        />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default AddEditPurchaseLines;