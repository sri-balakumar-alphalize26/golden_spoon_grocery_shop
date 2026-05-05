import React, { useState, useEffect } from 'react';
import { Keyboard, View } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { showToast } from '@utils/common';
import { post } from '@api/services/utils';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import { fetchSourceDropdown, fetchSalesPersonDropdown, fetchCustomersDropdown, fetchOpportunityDropdown, fetchEnquiryTypeDropdown} from '@api/dropdowns/dropdownApi';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useAuthStore } from '@stores/auth';
import { formatDateTime } from '@utils/common/date';
import { validateFields } from '@utils/validation';

const PipelineForm = ({ navigation }) => {

  const currentUser = useAuthStore((state) => state.user);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDropdownType, setSelectedDropdownType] = useState(null);
  const [isDropdownSheetVisible, setIsDropdownSheetVisible] = useState(false);

  const [formData, setFormData] = useState({
    dateTime: new Date(),
    source: '',
    enquiryType: '',
    salesPerson: { id: currentUser?.related_profile?._id || '', label: currentUser?.related_profile?.name },
    opportunity: '',
    customer: '',
    remarks: '',
  });

  const [errors, setErrors] = useState({});
  const [dropdowns, setDropdowns] = useState({
    source: [],
    enquiryType: [],
    salesPerson: [],
    customer: [],
    opportunity: [],
  });

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [sourceData, enquiryTypeData, salesPersonData, customerData, opportunityData] = await Promise.all([
          fetchSourceDropdown(),
          fetchEnquiryTypeDropdown(),
          fetchSalesPersonDropdown(),
          fetchCustomersDropdown(),
          fetchOpportunityDropdown(),
        ]);
        setDropdowns({
          source: sourceData.map(data => ({
            id: data._id,
            label: data.source_name,
          })),
          enquiryType: enquiryTypeData.map(data => ({
            id: data._id,
            label: data.type_name,
          })),
          salesPerson: salesPersonData.map(data => ({
            id: data._id,
            label: data.name,
          })),
          customer: customerData.map(data => ({
            id: data._id,
            label: data.name,
          })),
          opportunity: opportunityData.map(data => ({
            id: data._id,
            label: data.oppertunity_name,
          })),
        });
      } catch (error) {
        console.error('Error fetching dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);

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

  const toggleBottomSheet = (type) => {
    setSelectedDropdownType(type);
    setIsDropdownSheetVisible(!isDropdownSheetVisible);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedDropdownType) {
      case 'Source':
        items = dropdowns.source;
        fieldName = 'source';
        break;
      case 'Enquiry Type':
        items = dropdowns.enquiryType;
        fieldName = 'enquiryType';
        break;
      case 'Sales Person':
        items = dropdowns.salesPerson;
        fieldName = 'salesPerson';
        break;
      case 'Customer':
        items = dropdowns.customer;
        fieldName = 'customer';
        break;
      case 'Opportunity':
        items = dropdowns.opportunity;
        fieldName = 'opportunity';
        break;
      default:
        return null;
    }
    return (
      <DropdownSheet
        isVisible={isDropdownSheetVisible}
        items={items}
        title={selectedDropdownType}
        onClose={() => setIsDropdownSheetVisible(false)}
        onValueChange={(value) => handleFieldChange(fieldName, value)}
      />
    );
  };

  const handleDateConfirm = (date) => {
    handleFieldChange('dateTime', date);
    setIsDatePickerVisible(false);
  };


  const validateForm = (fieldsToValidate) => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const handleSubmit = async () => {
    const fieldsToValidate = ['source', 'enquiryType', 'salesPerson', 'opportunity', 'customer'];
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      const PipelineData = {
        date: formData?.dateTime,
        status: "opportunity",
        source_id: formData?.source?.id || null,
        enquiry_type_id: formData?.enquiryType?.id || null,
        sales_person_id: formData?.salesPerson?.id || null,
        oppertunity_type_id: formData?.opportunity?.id || null,
        customer_id: formData?.customer?.id || null,
        remarks: formData?.remarks || null,
      };

      console.log("Submitting Pipeline Data:", PipelineData)
      try {
        const response = await post("/createPipeline", PipelineData);
        if (response.success) {
          showToast({
            type: "success",
            title: "Success",
            message: response.message || "Pipeline created successfully",
          });
          navigation.navigate("PipelineScreen");
        } else {
          showToast({
            type: "error",
            title: "ERROR",
            message: response.message || "Pipeline creation failed",
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
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Add Pipeline"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer>
        <FormInput
          label="Date Time"
          dropIcon="calendar"
          editable={false}
          value={formatDateTime(formData.dateTime)}
          onPress={() => setIsDatePickerVisible(true)}
        />
        <FormInput
          label="Customer"
          placeholder="Select Customer"
          dropIcon="menu-down"
          editable={false}
          required
          validate={errors.customer}
          value={formData.customer?.label?.trim()}
          onPress={() => toggleBottomSheet('Customer')}
        />
        <FormInput
          label="Source"
          placeholder="Select Source"
          dropIcon="menu-down"
          editable={false}
          required
          validate={errors.source}
          value={formData.source?.label}
          onPress={() => toggleBottomSheet('Source')}
        />
        <FormInput
          label="Enquiry Type"
          placeholder="Enter Enquiry Type"
          dropIcon="menu-down"
          editable={false}
          required
          validate={errors.enquiryType}
          value={formData.enquiryType?.label}
          onPress={() => toggleBottomSheet('Enquiry Type')}
        />
        <FormInput
          label="Sales Person"
          placeholder="Select Sales person"
          dropIcon="menu-down"
          editable={false}
          required
          validate={errors.salesPerson}
          value={formData.salesPerson?.label}
          onPress={() => toggleBottomSheet('Sales Person')}
        />
        <FormInput
          label="Opportunity"
          placeholder="Enter Opportunity"
          dropIcon="menu-down"
          editable={false}
          required
          validate={errors.opportunity}
          value={formData.opportunity?.label}
          onPress={() => toggleBottomSheet('Opportunity')}
        />
        <FormInput
          label="Remarks"
          placeholder="Enter Remarks"
          editable={true}
          multiline={true}
          numberOfLines={5}
          textAlignVertical="top"
          marginTop={10}
          onChangeText={(value) => handleFieldChange('remarks', value)}
        />
        {renderBottomSheet()}
        <LoadingButton title="SAVE" onPress={handleSubmit} loading={isSubmitting} marginTop={10} />
        <DateTimePickerModal
          isDropdownSheetVisible={isDatePickerVisible}
          mode="date"
          onConfirm={handleDateConfirm}
          onCancel={() => setIsDatePickerVisible(false)}
        />
      </RoundedScrollContainer>
    </SafeAreaView>

  );
};

export default PipelineForm;
