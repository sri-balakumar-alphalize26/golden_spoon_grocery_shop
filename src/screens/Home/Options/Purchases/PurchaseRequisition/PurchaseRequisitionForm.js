import { StyleSheet, Keyboard, FlatList } from "react-native";
import React, { useEffect, useState } from "react";
import { RoundedScrollContainer, SafeAreaView } from "@components/containers";
import { NavigationHeader, TitleWithButton } from "@components/Header";
import { fetchEmployeesDropdown, fetchWarehouseDropdown } from "@api/dropdowns/dropdownApi";
import { DropdownSheet } from "@components/common/BottomSheets";
import { TextInput as FormInput } from "@components/common/TextInput";
import { LoadingButton } from "@components/common/Button";
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { formatDate } from "@utils/common/date";
import { useAuthStore } from "@stores/auth";
import { post } from "@api/services/utils";
import { OverlayLoader } from "@components/Loader";
import ProductLineList from "./ProductLineList";
import { validateFields } from '@utils/validation';
import { showToast } from '@utils/common';
import { showToastMessage } from "@components/Toast";

const PurchaseRequisitionForm = ({ route, navigation }) => {
  const { id } = route.params || {};
  const currentUser = useAuthStore((state) => state.user);
  const [isVisible, setIsVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [productLines, setProductLines] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dropdown, setDropdown] = useState({
    requestedByName: [],
    warehouse: [],
  });

  const [formData, setFormData] = useState({
    requestedByName: { id: currentUser?.related_profile?._id || null, label: currentUser?.related_profile?.name || '' },
    warehouse: { id: currentUser?.warehouse?.warehouse_id || '', label: currentUser?.warehouse?.warehouse_name },
    requestDate: new Date(),
    requireBy: "",
    productLines: [],
    quantity: "",
    remarks: "",
  });

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [requestedByNameData, warehouseData] = await Promise.all([
          fetchEmployeesDropdown(),
          fetchWarehouseDropdown(),
        ]);
        setDropdown({
          requestedByName: requestedByNameData.map((employee) => ({
            id: employee._id,
            label: employee.name,
          })),
          warehouse: warehouseData.map((data) => ({
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

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const handleDateConfirm = (date) => {
    const formattedDate = date.toISOString().slice(0, 10);
    handleFieldChange("requireBy", formattedDate);
    setIsDatePickerVisible(false);
  };

  const handleAddProductLine = (newProductLine) => {
    setProductLines((prevLines) => [...prevLines, newProductLine]);
    setFormData((prevData) => ({
      ...prevData,
      productLines: [...prevData.productLines, newProductLine],
    }));
  };

  useEffect(() => {
    if (route.params?.newProductLine) {
      handleAddProductLine(route.params.newProductLine);
    }
  }, [route.params?.newProductLine]);

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = "";

    switch (selectedType) {
      case "Requested By Name":
        items = dropdown.requestedByName;
        fieldName = "requestedByName";
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
        onValueChange={(value) => handleFieldChange(fieldName, value)}
      />
    );
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

  const validateForm = (fieldsToValidate) => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const handleSubmit = async () => {
    const fieldsToValidate = ['requestedByName', 'warehouse', 'requireBy'];
    if (productLines.length === 0) {
      showToastMessage('Please Add Products');
      return; 
    }
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      const purchaseData = {
        request_date: formData?.requestDate ?? null,
        requested_by: formData?.requestedByName?.id ?? null,
        require_by: formData?.requireBy ?? null,
        ware: formData?.warehouse?.label ?? '',
        _id: '',
        supplier_id: '',
        supplier_name: '',
        employee_name: '',
        request_details: [0],
        alternate_products: [],
        product_lines: productLines.map((item, index) => ({
          editable: false,
          no: index,
          product_name: item?.product_name || null,
          product_id: item?.product_id || null,
          quantity: item?.quantity || '',
          remarks: item?.remarks || '',
          suppliers: item?.suppliers?.map(supplier => ({
            supplier_id: supplier?.supplier_id,
            name: supplier?.name,
          })) || [],
        })),
      };
      // console.log('Purchase Data :', JSON.stringify(purchaseData, null, 2));
      
      try {
        const response = await post("/createPurchaseRequest", purchaseData);
        if (response.success === 'true' || response.success === true) {
          showToast({
            type: "success",
            title: "Success",
            message: response.message || "Purchase Requisition created successfully",
          });
          navigation.navigate("PurchaseRequisitionScreen");
        } else {
          console.error("Failed:", response.message);
          showToast({
            type: "error",
            title: "ERROR",
            message: response.message || "Purchase Requisition Creation failed",
          });
        }
      } catch (error) {
        console.error("Error Creating Purchase Requisition:", error);
        showToast({
          type: "error",
          title: "ERROR",
          message: "An unexpected error occurred. Please try again later.",
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Purchase Requisition Creation"
        onBackPress={() => navigation.goBack()}
        logo={false}
      />
      <RoundedScrollContainer>
        <FormInput
          label={"Requested By"}
          placeholder={"Select Employee Name"}
          dropIcon={"menu-down"}
          editable={false}
          validate={errors.requestedByName}
          value={formData.requestedByName?.label}
          required
          onPress={() => toggleBottomSheet("Requested By Name")}
        />
        <FormInput
          label={"Warehouse"}
          placeholder="Select Warehouse"
          dropIcon={"menu-down"}
          editable={false}
          validate={errors.warehouse}
          value={formData.warehouse?.label}
          required
          onPress={() => toggleBottomSheet("Warehouse")}
        />
        <FormInput
          label={"Requested Date"}
          editable={false}
          value={formatDate(formData.requestDate)}
        />
        <FormInput
          label={"Require By"}
          dropIcon={"calendar"}
          placeholder={"dd-mm-yyyy"}
          editable={false}
          required
          validate={errors.requireBy}
          value={formatDate(formData.requireBy)}
          onPress={() => setIsDatePickerVisible(true)}
        />
        <TitleWithButton
          label={'Add Product'}
          onPress={() => { navigation.navigate('AddProductLines'); }}
        />
        <FlatList
          data={productLines}
          renderItem={({ item }) => (
            <ProductLineList item={item} />
          )}
          keyExtractor={(item, index) => index.toString()}
        />
        {renderBottomSheet()}
        <LoadingButton
          title="SAVE"
          onPress={handleSubmit}
          marginTop={10}
          loading={isSubmitting}
        />
        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          onConfirm={handleDateConfirm}
          minimumDate={new Date()} 
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
    flexDirection: "row",
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
    color: "#666666",
  },
});

export default PurchaseRequisitionForm;