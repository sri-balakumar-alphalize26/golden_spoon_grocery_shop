import React, { useState, useEffect } from 'react';
import {  Keyboard } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { showToast } from '@utils/common';
import { post } from '@api/services/utils';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import { fetchSourceDropdown } from '@api/dropdowns/dropdownApi';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useAuthStore } from '@stores/auth';
import { formatDateTime } from '@utils/common/date';
import { validateFields } from '@utils/validation';

const EnquiryRegisterForm = ({ navigation }) => {

  const currentUserId = useAuthStore((state) => state.user?.related_profile?._id || '');
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDropdownType, setSelectedDropdownType] = useState(null);
  const [isDropdownSheetVisible, setIsDropdownSheetVisible] = useState(false);

  const [formData, setFormData] = useState({
    dateTime: new Date(),
    source: '',
    name: '',
    companyName: '',
    phoneNumber: '',
    emailAddress: '',
    address: '',
    enquiryDetails: '',
  });

  const [errors, setErrors] = useState({});
  const [dropdownOptions, setDropdownOptions] = useState({ source: [] });

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const sourceData = await fetchSourceDropdown();
        setDropdownOptions((prevDropdown) => ({
          ...prevDropdown,
          source: sourceData.map(data => ({
            id: data._id,
            label: data.source_name,
          })),
        }));
      } catch (error) {
        console.error('Error fetching source dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);

  const toggleDropdownSheet = (type) => {
    setSelectedDropdownType(type);
    setIsDropdownSheetVisible(!isDropdownSheetVisible);
  };

  const handleDateConfirm = (date) => {
    handleFieldChange('dateTime', date);
    setIsDatePickerVisible(false);
  };

  const renderDropdownSheet = () => {
    if (selectedDropdownType === 'Source') {
      return (
        <DropdownSheet
          isVisible={isDropdownSheetVisible}
          items={dropdownOptions.source}
          title={selectedDropdownType}
          onClose={() => setIsDropdownSheetVisible(false)}
          onValueChange={(value) => handleFieldChange('source', value)}
        />
      );
    }
    return null;
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
    const fieldsToValidate = ['name', 'phoneNumber', 'source']; 
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      const enquiryData = {
        image_url: null,
        date: formData?.dateTime || null,
        source_id: formData?.source?.id ?? null,
        name: formData?.name || null,
        status: "new",
        company_name: formData?.companyName || null,
        mobile_no: formData?.phoneNumber || null,
        email: formData?.emailAddress || null,
        address: formData?.address || null,
        created_by: currentUserId || null,
        enquiry_details: formData?.enquiryDetails || null,
      };

      try {
        const response = await post("/createEnquiryRegister", enquiryData);
        if (response.success) {
          showToast({
            type: "success",
            title: "Success",
            message: response.message || "Enquiry Register created successfully",
          });
          navigation.navigate("EnquiryRegisterScreen");
        } else {
          showToast({
            type: "error",
            title: "ERROR",
            message: response.message || "Enquiry Registration failed",
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
        title="Add Enquiry Register"
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
          label="Source"
          required
          placeholder="Select Source"
          dropIcon="menu-down"
          editable={false}
          validate={errors.source}
          value={formData.source?.label}
          onPress={() => toggleDropdownSheet('Source')}
        />
        <FormInput
          label="Name"
          required
          placeholder="Enter Name"
          editable={true}
          validate={errors.name}
          onChangeText={(value) => handleFieldChange('name', value)}
        />
        <FormInput
          label="Company Name"
          placeholder="Enter Company Name"
          editable={true}
          onChangeText={(value) => handleFieldChange('companyName', value)}
        />
        <FormInput
          label="Phone"
          required
          placeholder="Enter Phone Number"
          editable={true}
          keyboardType="numeric"
          validate={errors.phoneNumber}
          onChangeText={(value) => handleFieldChange('phoneNumber', value)}
        />
        <FormInput
          label="Email"
          placeholder="Enter Email"
          editable={true}
          validate={errors.emailAddress}
          onChangeText={(value) => handleFieldChange('emailAddress', value)}
        />
        <FormInput
          label="Address"
          placeholder="Enter Address"
          editable={true}
          validate={errors.address}
          onChangeText={(value) => handleFieldChange('address', value)}
        />
        <FormInput
          label="Enquiry Details"
          placeholder="Enter Enquiry Details"
          editable={true}
          multiline={true}
          numberOfLines={5}
          textAlignVertical="top"
          marginTop={10}
          onChangeText={(value) => handleFieldChange('enquiryDetails', value)}
        />
        {renderDropdownSheet()}
        <LoadingButton title="SAVE" onPress={handleSubmit} loading={isSubmitting} marginTop={10} />
        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="datetime"
          onConfirm={handleDateConfirm}
          onCancel={() => setIsDatePickerVisible(false)}
        />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default EnquiryRegisterForm;