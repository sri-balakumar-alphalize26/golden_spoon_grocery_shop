import React, { useState, useEffect } from 'react';
import { Keyboard } from 'react-native';
import * as Location from 'expo-location';
import { NavigationHeader } from '@components/Header';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import { DropdownSheet } from '@components/common/BottomSheets';
import { showToastMessage } from '@components/Toast';
import { formatDate } from '@utils/common/date';
import { showToast } from '@utils/common';
import { useAuthStore } from '@stores/auth';
import { fetchCustomersDropdown, fetchPurposeofVisitDropdown, fetchSiteLocationDropdown } from '@api/dropdowns/dropdownApi';
import { fetchCustomerDetails } from '@api/details/detailApi';
import { put } from '@api/services/utils';

const EditVisit = ({ navigation, route }) => {
  const { details } = route?.params || {};
  const currentUser = useAuthStore(state => state.user);

  const [formData, setFormData] = useState({
    customer: { label: details?.customer?.name, id: details?.customer?._id },
    siteLocation: { label: details?.site_location?.site_location_name, id: details?.site_location?._id },
    dateAndTime: details?.date_time,
    contactPerson: {
      label: details?.customer_contact?.map(contact => contact.contact_name).join(', '),
      contactNo: details?.customer_contact?.map(contact => contact.contact_number).join(', '),
      id: details?.customer_contact?.map(contact => contact._id).join()
    },
    visitPurpose: {
      label: details?.purpose_of_visit?.map(visit => visit.name).join(', '),
      id: details?.purpose_of_visit?.map(visit => visit._id).join()
    },
    remarks: details?.remarks,
    longitude: details?.longitude || null,
    latitude: details?.latitude || null
  });

  console.log("🚀 ~ EditVisit ~ formData:", formData.visitPurpose)
  const [dropdowns, setDropdowns] = useState({
    customers: [],
    siteLocation: [],
    visitPurpose: [],
    contactPerson: []
  });

  const [errors, setErrors] = useState({});
  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const customersDropdown = await fetchCustomersDropdown();
        const visitPurposeDropdown = await fetchPurposeofVisitDropdown();
        setDropdowns(prevDropdown => ({
          ...prevDropdown,
          customers: customersDropdown.map((data) => ({
            id: data._id,
            label: data.name?.trim(),
          })),
          visitPurpose: visitPurposeDropdown.map((data) => ({
            id: data._id,
            label: data.name,
          })),
        }));
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (formData.customer) {
      const fetchSiteLocationData = async () => {
        try {
          const siteLocations = await fetchSiteLocationDropdown(formData.customer.id);
          setDropdowns(prevDropdowns => ({
            ...prevDropdowns,
            siteLocation: siteLocations.map(data => ({ id: data._id, label: data.site_location_name }))
          }));
        } catch (error) {
          console.error('Error fetching site location data:', error);
        }
      };

      const fetchContactDetails = async () => {
        try {
          const contactDetails = await fetchCustomerDetails(formData.customer.id);
          setDropdowns(prevDropdowns => ({
            ...prevDropdowns,
            contactPerson: contactDetails[0]?.customer_contact?.map(data => ({
              id: data._id,
              label: data.contact_name,
              contactNo: data.contact_number.toString()
            }))
          }));
        } catch (error) {
          console.error('Error fetching contact details:', error);
        }
      };

      fetchSiteLocationData();
      fetchContactDetails();
    }
  }, [formData.customer]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission to access location was denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setFormData(prevFormData => ({
        ...prevFormData,
        longitude: location.coords.longitude,
        latitude: location.coords.latitude
      }));
    })();
  }, []);

  const handleFieldChange = (field, value) => {
    setFormData(prevFormData => ({
      ...prevFormData,
      [field]: value
    }));

    if (errors[field]) {
      setErrors(prevErrors => ({
        ...prevErrors,
        [field]: null
      }));
    }
  };

  const toggleBottomSheet = type => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedType) {
      case 'Customers':
        items = dropdowns.customers;
        fieldName = 'customer';
        break;
      case 'Visit Purpose':
        items = dropdowns.visitPurpose;
        fieldName = 'visitPurpose';
        break;
      case 'Site Location':
        items = dropdowns.siteLocation;
        fieldName = 'siteLocation';
        break;
      case 'Contact Person':
        items = dropdowns.contactPerson;
        fieldName = 'contactPerson';
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
        onValueChange={value => handleFieldChange(fieldName, value)}
      />
    );
  };

  const validate = () => {
    Keyboard.dismiss();
    const requiredFields = {
      customer: 'Please select a customer',
      siteLocation: 'Please select a site location',
      dateAndTime: 'Please select a date and time',
      contactPerson: 'Please select a contact person',
      remarks: 'Please enter remarks',
      visitPurpose: 'Please select a purpose of visit'
    };

    let isValid = true;
    let errors = {};

    Object.keys(requiredFields).forEach(field => {
      if (!formData[field]) {
        errors[field] = requiredFields[field];
        isValid = false;
      }
    });

    setErrors(errors);
    return isValid;
  };

  const submit = async () => {
    if (validate()) {
      setIsSubmitting(true);
      const visitData = {
        customer_visit_id: details?._id,
        employee_id: currentUser?.related_profile?._id,
        date_time: formData.dateAndTime,
        customer_id: formData.customer?.id,
        contact_no: formData.contactPerson?.contactNo,
        purpose_of_visit_id: formData.visitPurpose?.id,
        remarks: formData.remarks,
        site_location_id: formData.siteLocation?.id,
        contact_person_id: formData.contactPerson?.id,
        longitude: formData.longitude,
        latitude: formData.latitude
      };
      console.log("🚀 ~ submit ~ visitData:", visitData)

      try {
        const response = await put('/updateCustomerVisitList', visitData);
        console.log("🚀 ~ submit ~ response:", response)
        if (response.success) {
          showToast({ type: 'success', title: 'Success', message: response.message || 'Visits updated successfully' });
          navigation.goBack();
        } else {
          showToast({ type: 'error', title: 'ERROR', message: response.message || 'Customer Visit updation failed' });
        }
      } catch (error) {
        showToast({ type: 'error', title: 'ERROR', message: 'An unexpected error occurred. Please try again later.' });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Edit Customer Visit" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>
        <FormInput
          label="Date & Time"
          dropIcon="calendar"
          editable={false}
          value={formatDate(formData.dateAndTime, 'dd-MM-yyyy hh:mm:ss')}
        />
        <FormInput
          label="Customer Name"
          placeholder="Select Customer"
          dropIcon="menu-down"
          editable={false}
          multiline={true}
          value={formData.customer?.label?.trim()}
          validate={errors.customer}
          onPress={() => toggleBottomSheet('Customers')}
        />
        <FormInput
          label="Site/Location"
          placeholder="Select Site / Location"
          dropIcon="menu-down"
          editable={false}
          value={formData.siteLocation?.label}
          validate={errors.siteLocation}
          onPress={() => formData.customer ? toggleBottomSheet('Site Location') : showToastMessage('Select Customer!')}
        />
        <FormInput
          label="Contact Person"
          placeholder="Contact person"
          dropIcon="menu-down"
          editable={false}
          value={formData.contactPerson?.label}
          validate={errors.contactPerson}
          onPress={() => formData.customer ? toggleBottomSheet('Contact Person') : showToastMessage('Select Customer!')}
        />
        <FormInput
          label="Contact No"
          placeholder="Contact person"
          dropIcon="menu-down"
          editable={false}
          value={formData.contactPerson?.contactNo}
          onPress={() => !formData.customer && showToastMessage('Select Customer!')}
        />
        <FormInput
          label="Visit Purpose"
          placeholder="Select purpose of visit"
          dropIcon="menu-down"
          editable={false}
          value={formData.visitPurpose?.label}
          validate={errors.visitPurpose}
          onPress={() => toggleBottomSheet('Visit Purpose')}
        />
        <FormInput
          label="Remarks"
          placeholder="Enter Remarks"
          multiline={true}
          numberOfLines={5}
          value={formData.remarks}
          validate={errors.remarks}
          onChangeText={value => handleFieldChange('remarks', value)}
        />
        {renderBottomSheet()}
        <LoadingButton title="SUBMIT" onPress={submit} loading={isSubmitting} />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default EditVisit;
