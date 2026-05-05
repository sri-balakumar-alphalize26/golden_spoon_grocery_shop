import React, { useEffect, useState } from "react";
import { RoundedScrollContainer, SafeAreaView } from "@components/containers";
import { TextInput as FormInput } from "@components/common/TextInput";
import { fetchProductsDropdown, fetchUnitOfMeasureDropdown, fetchTaxDropdown } from "@api/dropdowns/dropdownApi";
import { DropdownSheet } from "@components/common/BottomSheets";
import { NavigationHeader } from "@components/Header";
import { Button } from "@components/common/Button";
import { COLORS } from "@constants/theme";
import { Keyboard } from "react-native";
import { validateFields } from "@utils/validation";
import { CheckBox } from "@components/common/CheckBox";
import { formatDate } from "@utils/common/date";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { showToastMessage } from "@components/Toast";

const AddVendorProducts = ({ navigation }) => {
  const [searchText, setSearchText] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [errors, setErrors] = useState({});
  const [selectedType, setSelectedType] = useState(null);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  const [dropdown, setDropdown] = useState({
    products: [],
    unitofmeasure: [],
    taxes: [],
  });

  const [formData, setFormData] = useState({
    product: "",
    productName: "",
    description: "",
    scheduledDate: new Date(),
    quantity: "",
    uom: "",
    unitPrice: "",
    taxes: "vat 5%",
    isInclusive: false,
    subTotal: "",
    totalAmount: "",
    tax: "",
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
        const uomItems = UnitOfMeasureData.map((data) => ({
          id: data._id,
          label: data.uom_name,
        }));

        const defaultUOM = uomItems.find((uom) => uom.label === "Pcs");
        setDropdown((prevDropdown) => ({
          ...prevDropdown,
          unitofmeasure: uomItems,
        }));

        if (defaultUOM) {
          setFormData((prevFormData) => ({
            ...prevFormData,
            uom: defaultUOM,
          }));
        }
      } catch (error) {
        console.error("Error fetching Unit Of Measure dropdown data:", error);
      }
    };

    fetchUnitOfMeasure();
  }, []);

  useEffect(() => {
    const fetchTax = async () => {
      try {
        const TaxData = await fetchTaxDropdown();
        const taxItems = TaxData.map(data => ({
          id: data._id,
          label: data.tax_type_name,
        }));

        const defaultTax = taxItems.find(tax => tax.label === "vat 5%");
        // console.log("Default Tax : ", defaultTax)
        // setDropdown(prevDropdown => ({
        //     ...prevDropdown,
        //     taxes: taxItems,
        // }));

        if (defaultTax) {
          setFormData(prevFormData => ({
            ...prevFormData,
            taxType: defaultTax,
          }));
        }
      } catch (error) {
        console.error('Error fetching Tax dropdown data:', error);
      }
    };

    fetchTax();
  }, []);

  const calculateAmounts = (unitPrice, quantity, isInclusive) => {
    const subtotal = parseFloat(unitPrice || 0) * parseFloat(quantity || 0);
    let tax = 0;

    if (isInclusive) {
      tax = (subtotal / 1.05) * 0.05;
    } else {
      tax = subtotal * 0.05;
    }

    return {
      subTotal: isInclusive ? (subtotal - tax).toFixed(2) : subtotal.toFixed(2),
      tax: tax.toFixed(2),
      totalAmount: isInclusive
        ? subtotal.toFixed(2)
        : (subtotal + tax).toFixed(2),
    };
  };

  const handleFieldChange = (field, value) => {
    const updatedFormData = { ...formData, [field]: value };

    if (["unitPrice", "quantity", "isInclusive"].includes(field)) {
      const { unitPrice, quantity, isInclusive } = updatedFormData;
      const amounts = calculateAmounts(unitPrice, quantity, isInclusive);
      Object.assign(updatedFormData, amounts);
    }

    setFormData(updatedFormData);
    if (errors[field]) {
      setErrors((prevErrors) => ({
        ...prevErrors,
        [field]: null,
      }));
    }
  };

  const handleInclusiveChange = (isInclusive) => {
    handleFieldChange("isInclusive", isInclusive);
  };

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

  const handleProductSelection = (selectedProduct) => {
    setFormData((prevFormData) => ({
      ...prevFormData,
      product: selectedProduct.id,
      productName: selectedProduct.label,
      description: selectedProduct.product_description || '',
    }));
    setIsVisible(false);
  };

  const handleAddProducts = () => {
    const fieldsToValidate = ["productName", "quantity", "unitPrice"];
    if ((formData.quantity) <= 0) {
      showToastMessage('Quantity should be greater than 0');
      return;
    }
    if ((formData.unitPrice) <= 0) { 
      showToastMessage('Unit Price should be greater than 0');        
      return;
    }

    if (validateForm(fieldsToValidate)) {
      const productLine = {
        product_id: formData.product,
        product_name: formData.productName,
        description: formData.description || "",
        scheduledDate: formatDate(formData.scheduledDate || ""),
        quantity: formData.quantity || "",
        uom: formData.uom || "",
        unitPrice: formData.unitPrice || "",
        taxes: formData.taxType || "",
        subTotal: formData.subTotal || "",
        tax: formData.tax || "",
        totalAmount: formData.totalAmount || "",
      };
      // // // console.log("🚀 ~ AddVendorProducts ~ productLine:", JSON.stringify(productLine, null, 2));
      navigation.navigate("VendorBillFormTabs", { newProductLine: productLine });
    }
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedType) {
      case 'Product Name':
        items = dropdown.products;
        fieldName = 'product';
        break;
      case 'UOM':
        items = dropdown.unitofmeasure;
        fieldName = 'uom';
        break;
      case 'Tax':
        items = dropdown.taxes;
        fieldName = 'tax';
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
        search={true}
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
        title="Add Vendor Products"
        onBackPress={() => navigation.goBack()}
        logo={false}
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
          onPress={() => toggleBottomSheet("Product Name")}
        />
        <FormInput
          label="Description"
          placeholder="Enter Description"
          value={formData.description}
          onChangeText={(value) => handleFieldChange("description", value)}
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
          required
          value={formData.quantity}
          validate={errors.quantity}
          onChangeText={(value) => handleFieldChange("quantity", value)}
        />
        <FormInput
          label="Unit Of Measure"
          placeholder="Unit Of Measure"
          editable={false}
          value={formData.uom?.label || ""}
          // dropIcon="menu-down"
          // onPress={() => toggleBottomSheet("UOM")}
        />
        <FormInput
          label="Unit Price"
          placeholder="Unit Price"
          keyboardType="numeric"
          required
          value={formData.unitPrice.toString()}
          validate={errors.unitPrice}
          onChangeText={(value) => handleFieldChange("unitPrice", parseFloat(value))}
        />
        <FormInput
          label="Tax"
          placeholder="Select Tax Type"
          editable={false}
          value={formData.taxes}
        // onPress={() => toggleBottomSheet('Tax')}
        />
        <CheckBox
          checked={formData.isInclusive}
          onPress={() => handleInclusiveChange(!formData.isInclusive)}
          label="Is Inclusive"
        />
        <FormInput
          label="Sub Total"
          placeholder="Sub Total"
          editable={false}
          value={formData.subTotal}
        />
        <FormInput
          label="Tax"
          placeholder="Tax"
          editable={false}
          value={formData.tax}
        />
        <FormInput
          label="Total"
          placeholder="Total"
          editable={false}
          value={formData.totalAmount}
        />
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
        {renderBottomSheet()}
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default AddVendorProducts;