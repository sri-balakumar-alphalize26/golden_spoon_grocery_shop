import { Keyboard } from 'react-native';
import React, { useState, useEffect } from 'react';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { TextInput as FormInput } from '@components/common/TextInput';
import { fetchCustomersDropdown, fetchEmployeesDropdown, fetchPurposeofVisitDropdown } from '@api/dropdowns/dropdownApi';
import { DropdownSheet } from '@components/common/BottomSheets';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { formatDate } from '@utils/common/date';
import { useAuthStore } from '@stores/auth';
import { validateFields } from '@utils/validation';
import { post } from '@api/services/utils';
import { showToast } from '@utils/common';

const VisitPlanForm = ({ navigation }) => {

  const currentUser = useAuthStore(state => state.user)

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [isTimePickerVisible, setIsTimePickerVisible] = useState(false);
  const [isDateTimePickerVisible, setIsDateTimePickerVisible] = useState(false);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    customer: '',
    assignedTo: { id: currentUser?.related_profile?._id || '', label: currentUser?.related_profile?.name || '' },
    brand: '',
    selectDuration: '',
    dateAndTime: '',
    visitPurpose: '',
    remarks: '',
  });

  const [dropdown, setDropdown] = useState({
    customer: [],
    assignedTo: [],
    brand: [],
    selectDuration: [
      { id: 'tomorrow', label: 'Tomorrow' },
      { id: 'custom', label: 'Custom Date' }
    ],
    visitPurpose: [],
    remarks: [],
  });

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

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const customerDropdown = await fetchCustomersDropdown();
        const assignedToDropdown = await fetchEmployeesDropdown();
        const visitPurposeDropdown = await fetchPurposeofVisitDropdown();
        setDropdown((prevDropdown) => ({
          ...prevDropdown,
          customer: customerDropdown.map((data) => ({ id: data._id, label: data.name?.trim() })),
          assignedTo: assignedToDropdown.map((data) => ({ id: data._id, label: data.name })),
          visitPurpose: visitPurposeDropdown.map((data) => ({ id: data._id, label: data.name }))
        }));
      } catch (error) {
        console.error('Error fetching dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);


  useEffect(() => {
    if (formData.selectDuration?.id === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      handleFieldChange('dateAndTime', tomorrow);
      setIsTimePickerVisible(true);
    } else if (formData.selectDuration?.id === 'custom') {
      setIsDateTimePickerVisible(true);
    }
  }, [formData.selectDuration]);

  const handleTimeChange = (time) => {
    if (time) {
      const selectedDate = formData.dateAndTime ? new Date(formData.dateAndTime) : new Date();
      selectedDate.setHours(time.getHours());
      selectedDate.setMinutes(time.getMinutes());
      handleFieldChange('dateAndTime', selectedDate);
    }
    setIsTimePickerVisible(false);
  };

  const handleDateChange = (date) => {
    if (date) {
      handleFieldChange('dateAndTime', date);
    }
    setIsDateTimePickerVisible(false);
  };

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedType) {
      case 'Customers':
        items = dropdown.customer;
        fieldName = 'customer';
        break;
      case 'Employees':
        items = dropdown.assignedTo;
        fieldName = 'assignedTo';
        break;
      case 'Select Duration':
        items = dropdown.selectDuration;
        fieldName = 'selectDuration';
        break;
      case 'Visit Purpose':
        items = dropdown.visitPurpose;
        fieldName = 'visitPurpose';
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

  const validateForm = (fieldsToValidate) => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const handleSubmit = async () => {
    const fieldsToValidate = ['customer', 'dateAndTime', 'visitPurpose', 'remarks'];
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      const visitPlanData = {
        visit_date: formData.dateAndTime,
        customer_id: formData.customer?.id,
        purpose_of_visit_id: formData.visitPurpose?.id,
        sales_person_id: currentUser?.related_profile?._id || '',
        remarks: formData.remarks,
        visit_employee_id: formData?.assignedTo?.id,
        // created_by_id: currentUser?._id
      };
      try {
        const response = await post("/createVisitPlan", visitPlanData);
        if (response.success) {
          showToast({ type: "success", title: "Success", message: response.message || "Visit Plan created successfully" });
          navigation.navigate("VisitsPlanScreen");
        } else {
          showToast({ type: "error", title: "Error", message: response.message || "Create Visit Plan failed" });
        }
      } catch (error) {
        showToast({ type: "error", title: "Error", message: "An unexpected error occurred. Please try again later." });
      } finally {
        setIsSubmitting(false);
      }
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="New Customer Visit Plan"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer>
        <FormInput
          label={"Customer Name"}
          placeholder={"Select Customer"}
          value={formData?.customer?.label}
          dropIcon={"menu-down"}
          editable={false}
          required
          multiline
          validate={errors.customer}
          onPress={() => toggleBottomSheet('Customers')}
        />
        <FormInput
          label={"Assigned To"}
          placeholder={"Select Assignee"}
          dropIcon={"menu-down"}
          value={formData?.assignedTo?.label}
          editable={false}
          required
          onPress={() => toggleBottomSheet('Employees')}
        />
        <FormInput
          label={"Date & Time"}
          placeholder={"Select visit time"}
          dropIcon={"menu-down"}
          required
          editable={false}
          value={formData.dateAndTime ? formatDate(formData.dateAndTime, 'dd-MM-yyyy HH:mm:ss') : "Select visit time"}
          validate={errors.dateAndTime}
          onPress={() => toggleBottomSheet('Select Duration')}
        />
        <FormInput
          label={"Visit Purpose"}
          placeholder={"Select purpose of visit"}
          dropIcon={"menu-down"}
          editable={false}
          required
          value={formData?.visitPurpose?.label}
          validate={errors.visitPurpose}
          onPress={() => toggleBottomSheet('Visit Purpose')}
        />
        <FormInput
          label={"Remarks"}
          required
          placeholder={"Enter remarks"}
          multiline={true}
          numberOfLines={5}
          validate={errors.remarks}
          textAlignVertical={'top'}
          onChangeText={(value) => handleFieldChange('remarks', value)}
        />
        {renderBottomSheet()}
        <LoadingButton
          loading={isSubmitting}
          title={'SAVE'}
          onPress={handleSubmit}
        />
        <DateTimePickerModal
          isVisible={isTimePickerVisible}
          mode='time'
          display="default"
          accentColor='green'
          onConfirm={handleTimeChange}
          onCancel={() => setIsTimePickerVisible(false)}
        />
        <DateTimePickerModal
          isVisible={isDateTimePickerVisible}
          mode='datetime'
          display="default"
          accentColor='green'
          onConfirm={handleDateChange}
          onCancel={() => setIsDateTimePickerVisible(false)}
        />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default VisitPlanForm;
