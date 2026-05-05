import React, { useEffect, useState } from "react";
import { RoundedScrollContainer, SafeAreaView } from "@components/containers";
import { NavigationHeader } from "@components/Header";
import { TextInput as FormInput } from "@components/common/TextInput";
import { Button } from "@components/common/Button";
import { DropdownSheet, MultiSelectDropdownSheet } from "@components/common/BottomSheets";
import { COLORS } from "@constants/theme";
import { fetchProductsDropdown, fetchSupplierDropdown } from "@api/dropdowns/dropdownApi";
import { Keyboard, Alert } from "react-native";
import { validateFields } from '@utils/validation';

const AddPriceLines = ({ navigation, route }) => {
  const [searchText, setSearchText] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [errors, setErrors] = useState({});
  const [dropdown, setDropdown] = useState({
    products: [],
    suppliers: [],
  });

  const [formData, setFormData] = useState({
    productId: "",
    productName: "",
    description: '',
    suppliers: [],
    quantity: "",
    remarks: "",
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
            productDescription: data.product_description, // Include description
          })),
        }));
      } catch (error) {
        console.error("Error fetching Products dropdown data:", error);
      }
    };
    if (selectedType === "Product") {
      fetchProducts();
    }
  }, [searchText, selectedType]);
  
  const handleProductSelection = (selectedProduct) => {
    setFormData((prevFormData) => ({
      ...prevFormData,
      description: selectedProduct.productDescription || '', // Automatically set description
      productId: selectedProduct.id,
      productName: selectedProduct.label,
    }));
  };

  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const supplierData = await fetchSupplierDropdown(searchText);
        setDropdown((prevDropdown) => ({
          ...prevDropdown,
          suppliers: supplierData?.map((data) => ({
            id: data._id,
            label: data.name?.trim(),
          })),
        }));
      } catch (error) {
        console.error("Error fetching Supplier dropdown data:", error);
      }
    };
    if (selectedType === "Supplier") {
      fetchSuppliers();
    }
  }, [searchText, selectedType]);

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible((prev) => !prev);
  };

  const handleSupplierSelection = (selectedValues) => {
    setSelectedSuppliers(selectedValues);
    setFormData((prevFormData) => ({
      ...prevFormData,
      suppliers: selectedValues,
    }));
  };

  const validateForm = (fieldsToValidate) => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const handleAddProducts = () => {
    const fieldsToValidate = ['productName', 'quantity', 'remarks', 'suppliers'];
    if (validateForm(fieldsToValidate)) {
      const productLines = {
        product_name: formData.productName || '',
        product_id: formData.productId || '',
        description: formData.description || '',
        quantity: formData.quantity || '',
        remarks: formData.remarks || '',
        suppliers: selectedSuppliers.map((supplier) => ({
          supplier_id: supplier.id,
          name: supplier.label,
        })),
      };
      console.log('Product Lines Data:', productLines);
      navigation.navigate("PriceEnquiryForm", { newProductLine: productLines });
    }
  };

  const renderBottomSheet = () => {
    let items = [];
    let isMultiSelect = true;

    switch (selectedType) {
      case "Product":
        items = dropdown.products;
        isMultiSelect = false;
        break;
      case "Supplier":
        items = dropdown.suppliers;
        isMultiSelect = true;
        break;
      default:
        return null;
    }

    return isMultiSelect ? (
      <MultiSelectDropdownSheet
        isVisible={isVisible}
        items={items}
        title={selectedType}
        refreshIcon={false}
        search
        onSearchText={(value) => setSearchText(value)}
        previousSelections={selectedSuppliers}
        onValueChange={handleSupplierSelection}
        onClose={() => setIsVisible(false)}
      />
    ) : (
      <DropdownSheet
        isVisible={isVisible}
        items={items}
        title={selectedType}
        onClose={() => setIsVisible(false)}
        search
        onSearchText={(value) => setSearchText(value)}
        onValueChange={(value) => {
          setSearchText("");
          if (selectedType === "Product") {
            handleProductSelection(value);
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
          label={"Product"}
          placeholder={"Select Product"}
          dropIcon={"menu-down"}
          editable={false}
          required
          multiline={true}
          validate={errors.productName}
          value={formData.productName}
          onPress={() => toggleBottomSheet("Product")}
        />
        <FormInput
          label="Description"
          placeholder="Enter Description"
          value={formData.description}
          // onChangeText={(value) => handleFieldChange('description', value)}
          onChangeText={(value) =>
            setFormData((prevFormData) => ({ ...prevFormData, description: value }))
          }
        />
        <FormInput
          label={"Quantity"}
          placeholder={"Enter Quantity"}
          required
          editable={true}
          keyboardType='numeric'
          validate={errors.quantity}
          value={formData.quantity}
          onChangeText={(text) =>
            setFormData((prevFormData) => ({ ...prevFormData, quantity: text }))
          }
        />
        <FormInput
          label={"Remarks"}
          placeholder={"Enter Remarks"}
          required
          editable={true}
          multiline={true}
          validate={errors.remarks}
          value={formData.remarks}
          onChangeText={(text) =>
            setFormData((prevFormData) => ({ ...prevFormData, remarks: text }))
          }
        />
        <FormInput
          label={"Supplier"}
          placeholder={"Add Suppliers"}
          dropIcon={"menu-down"}
          multiline={true}
          editable={false}
          required
          validate={errors.suppliers}
          value={selectedSuppliers.map((supplier) => supplier.label).join(", ")}
          onPress={() => toggleBottomSheet("Supplier")}
        />
        <Button
          title={"Add Product"}
          width={"50%"}
          alignSelf={"center"}
          backgroundColor={COLORS.primaryThemeColor}
          onPress={handleAddProducts}
        />
        {renderBottomSheet()}
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default AddPriceLines;