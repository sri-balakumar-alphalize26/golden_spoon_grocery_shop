import React, { useState, useEffect, useCallback } from 'react';
import { Keyboard, View } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { showToast } from '@utils/common';
import { post } from '@api/services/utils';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import { fetchEmployeesDropdown, fetchSourceDropdown } from '@api/dropdowns/dropdownApi';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useAuthStore } from '@stores/auth';
import { formatDate } from '@utils/common/date';
import { priority } from '@constants/dropdownConst';
import { validateFields } from '@utils/validation';
import { fetchEnquiryRegisterDetails } from '@api/details/detailApi';
import { useFocusEffect } from '@react-navigation/native';
import { OverlayLoader } from '@components/Loader';

const LeadForm = ({ navigation, route }) => {
  const { enquiryId } = route?.params || {};
  const currentUser = useAuthStore((state) => state.user);

  const [isLoading, setIsLoading] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDropdownType, setSelectedDropdownType] = useState(null);
  const [isDropdownSheetVisible, setIsDropdownSheetVisible] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date(),
    source: { id: '', label: '' },
    salesPerson: { id: currentUser?.related_profile?._id || null, label: currentUser?.related_profile?.name || '' },
    priority: '',
    contactName: '',
    companyName: '',
    jobPosition: '',
    phoneNumber: '',
    whatsappNumber: '',
    emailAddress: '',
    address: '',
    remarks: '',
    expectedClosingDate: null,
  });

  const [errors, setErrors] = useState({});
  const [dropdowns, setDropdowns] = useState({ source: [], salesPerson: [] });

  const fetchDetails = async (enquiryId) => {
    setIsLoading(true);
    try {
      const [detail] = await fetchEnquiryRegisterDetails(enquiryId);
      setFormData((prevFormData) => ({
        ...prevFormData,
        source: { id: detail?.source?.source_id || '', label: detail?.source?.source_name || '' },
        contactName: detail?.name || '',
        companyName: detail?.company_name || '',
        phoneNumber: detail?.mobile_no || '',
        emailAddress: detail?.email || '',
        address: detail?.address || '',
        remarks: detail?.enquiry_details || '',
      }));
    } catch (error) {
      console.error('Error fetching enquiry details:', error);
      showToast({ type: 'error', title: 'Error', message: 'Failed to fetch enquiry details. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (enquiryId) {
        fetchDetails(enquiryId);
      }
    }, [enquiryId])
  );

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const sourceDropdown = await fetchSourceDropdown();
        const salesPersonDropdown = await fetchEmployeesDropdown();
        setDropdowns({
          source: sourceDropdown.map(data => ({ id: data._id, label: data.source_name })),
          salesPerson: salesPersonDropdown.map(data => ({ id: data._id, label: data.name })),
        });
      } catch (error) {
        console.error('Error fetching dropdown data:', error);
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

  const toggleDropdownSheet = (type) => {
    setSelectedDropdownType(type);
    setIsDropdownSheetVisible(!isDropdownSheetVisible);
  };

  const handleDateConfirm = (date) => {
    const formattedDate = formatDate(date, 'yyyy-MM-dd');
    handleFieldChange('expectedClosingDate', formattedDate);
    setIsDatePickerVisible(false);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedDropdownType) {
      case 'Source':
        items = dropdowns.source;
        fieldName = 'source';
        break;
      case 'Sales Person':
        items = dropdowns.salesPerson;
        fieldName = 'salesPerson';
        break;
      case 'Priority':
        items = priority;
        fieldName = 'priority';
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

  const validateForm = (fieldsToValidate) => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const handleSubmit = async () => {
    const fieldsToValidate = ['contactName', 'phoneNumber', 'salesPerson', 'source', 'priority'];
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      const leadData = {
        date: formatDate(formData.date, 'yyyy-MM-dd'),
        contact_name: formData.contactName,
        company_name: formData.companyName,
        address: formData.address,
        job_position: formData.jobPosition,
        email: formData.emailAddress,
        phone_no: formData.phoneNumber,
        whatsapp_no: formData.whatsappNumber,
        status: 'new',
        sales_person_id: formData?.salesPerson?.id || null,
        audio_url: null,
        customer_id: null,
        source_id: formData?.source?.id ?? null,
        remarks: formData.remarks,
        priority: formData.priority?.value,
        expected_closing_date: formData.expectedClosingDate || null,
        created_by_id: currentUser?.related_profile?._id || null,
        created_by_name: currentUser?.related_profile?.name || null,
        enquiry_register_id: enquiryId || null,
      };
      // console.log("🚀 ~ handleSubmit ~ leadData:", JSON.stringify(leadData, null, 2))
      try {
        const response = await post("/createLead", leadData);
        if (response.success) {
          showToast({ type: "success", title: "Success", message: response.message || "Leads created successfully" });
          navigation.navigate("LeadScreen");
        } else {
          showToast({ type: "error", title: "Error", message: response.message || "Create Leads failed" });
        }
      } catch (error) {
        showToast({ type: "error", title: "Error", message: "An unexpected error occurred. Please try again later." });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Add Leads" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>
        <FormInput
          label="Date"
          dropIcon="calendar"
          editable={false}
          value={formatDate(formData.date)}
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
          label="Sales Person"
          required
          placeholder="Select Sales person"
          dropIcon="menu-down"
          editable={false}
          validate={errors.salesPerson}
          value={formData.salesPerson?.label}
          onPress={() => toggleDropdownSheet('Sales Person')}
        />
        <FormInput
          label="Priority"
          required
          placeholder="Select Priority"
          dropIcon="menu-down"
          editable={false}
          validate={errors.priority}
          value={formData.priority?.label}
          onPress={() => toggleDropdownSheet('Priority')}
        />
        <FormInput
          label="Contact Name"
          required
          placeholder="Enter Name"
          value={formData.contactName}
          validate={errors.contactName}
          onChangeText={(value) => handleFieldChange('contactName', value)}
        />
        <FormInput
          label="Company Name"
          placeholder="Enter Company Name"
          onChangeText={(value) => handleFieldChange('companyName', value)}
          value={formData.companyName}
        />
        <FormInput
          label="Job Position"
          placeholder="Enter Job Position"
          onChangeText={(value) => handleFieldChange('jobPosition', value)}
        />
        <FormInput
          label="Phone Number"
          required
          placeholder="Enter Phone Number"
          keyboardType="numeric"
          value={formData.phoneNumber}
          validate={errors.phoneNumber}
          onChangeText={(value) => handleFieldChange('phoneNumber', value)}
        />
        <FormInput
          label="Whatsapp Number"
          placeholder="Enter whatsapp Number"
          keyboardType="numeric"
          onChangeText={(value) => handleFieldChange('whatsappNumber', value)}
        />
        <FormInput
          label="Email"
          placeholder="Enter Email"
          validate={errors.emailAddress}
          value={formData.emailAddress}
          onChangeText={(value) => handleFieldChange('emailAddress', value)}
        />
        <FormInput
          label="Address"
          placeholder="Enter Address"
          validate={errors.address}
          value={formData.address}
          onChangeText={(value) => handleFieldChange('address', value)}
        />
        <FormInput
          label="Expected Closing Date"
          dropIcon="calendar"
          placeholder="DD-MM-YYYY"
          editable={false}
          value={formData.expectedClosingDate ? formatDate(formData.expectedClosingDate, 'dd-MM-yyyy') : ''}
          onPress={() => setIsDatePickerVisible(true)}
        />
        <FormInput
          label="Remarks"
          placeholder="Remarks"
          multiline={true}
          numberOfLines={5}
          textAlignVertical="top"
          value={formData.remarks}
          marginTop={10}
          onChangeText={(value) => handleFieldChange('remarks', value)}
        />
        {renderBottomSheet()}
        <LoadingButton title="SAVE" onPress={handleSubmit} marginTop={10} loading={isSubmitting} />
        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          onConfirm={handleDateConfirm}
          onCancel={() => setIsDatePickerVisible(false)}
        />
        <View style={{ marginBottom: 10 }} />
        <OverlayLoader visible={isLoading} />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default LeadForm;
