import { Keyboard } from 'react-native'
import React, { useState, useEffect, useCallback } from 'react'
import { NavigationHeader } from '@components/Header'
import { RoundedScrollContainer, SafeAreaView } from '@components/containers'
import { TextInput as FormInput } from '@components/common/TextInput'
import { formatDate } from '@utils/common/date'
import { LoadingButton } from '@components/common/Button'
import { DropdownSheet } from '@components/common/BottomSheets'
import * as Location from 'expo-location';
import { fetchCustomersDropdown, fetchPurposeofVisitDropdown, fetchSiteLocationDropdown } from '@api/dropdowns/dropdownApi'
import { fetchCustomerDetails, fetchPipelineDetails, fetchVisitPlanDetails } from '@api/details/detailApi'
import { showToastMessage } from '@components/Toast'
import { useAuthStore } from '@stores/auth'
import { showToast } from '@utils/common'
import { post } from '@api/services/utils'
import { OverlayLoader } from '@components/Loader'
import { validateFields } from '@utils/validation'

const VisitForm = ({ navigation, route }) => {

  const { visitPlanId = "", pipelineId = "" } = route?.params || {};
  const currentUser = useAuthStore((state) => state.user);
  const [selectedType, setSelectedType] = useState(null);
  const [errors, setErrors] = useState({});
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    customer: '',
    siteLocation: '',
    dateAndTime: new Date(),
    contactPerson: '',
    visitPurpose: '',
    remarks: '',
    longitude: null,
    latitude: null
  })

  const [isCustomerSelected, setIsCustomerSelected] = useState(false);

  useEffect(() => {
    setIsCustomerSelected(!!formData.customer);
  }, [formData.customer]);

  const [dropdowns, setDropdowns] = useState({ customers: [], siteLocation: [], visitPurpose: [], contactPerson: [] })

  const fetchVisitPlan = async () => {
    setIsLoading(true);
    try {
      const [detail] = await fetchVisitPlanDetails(visitPlanId);
      setFormData(prev => ({
        ...prev,
        customer: {
          id: detail?.customer_id || '',
          label: detail?.customer_name?.trim() || ''
        },
        dateAndTime: detail?.visit_date || '',
        visitPurpose: {
          id: detail?.purpose_of_visit_id || '',
          label: detail?.purpose_of_visit_name
        },
        remarks: detail?.remarks || '',
      }));
    } catch (error) {
      console.error('Error fetching visit plan details:', error);
      showToast({ type: 'error', title: 'Error', message: 'Failed to fetch visit plan details. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };


  const fetchPipeline = async () => {
    setIsLoading(true);
    try {
      const [detail] = await fetchPipelineDetails(pipelineId);
      setFormData(prev => ({
        ...prev,
        customer: {
          id: detail?.customer?.customer_id || '',
          label: detail?.customer?.name?.trim() || ''
        },
        remarks: detail?.remarks || '',
      }));
    } catch (error) {
      console.error('Error fetching pipeline details:', error);
      showToast({ type: 'error', title: 'Error', message: 'Failed to fetch pipeline details. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visitPlanId) {
      fetchVisitPlan(visitPlanId);
    } else if (pipelineId) {
      fetchPipeline(pipelineId)
    }
  }, [visitPlanId, pipelineId])

  useEffect(() => {
    (async () => {
      // Request permission to access location
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission to access location was denied');
        return;
      }

      // Get current location
      let location = await Location.getCurrentPositionAsync({});
      setFormData(prev => ({
        ...prev,
        longitude: location.coords.longitude,
        latitude: location.coords.latitude,
      }));
    })();
  }, []);

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
          const siteLocationDropdown = await fetchSiteLocationDropdown(formData.customer.id);
          setDropdowns(prevDropdown => ({
            ...prevDropdown,
            siteLocation: siteLocationDropdown.map(data => ({
              id: data._id,
              label: data.site_location_name,
            })),
          }));
        } catch (error) {
          console.error('Error fetching site dropdown data:', error);
        }
      };

      fetchSiteLocationData();
    }
  }, [formData.customer]);

  useEffect(() => {
    if (formData.customer) {
      const fetchContactDetails = async () => {
        try {
          const contactDetailsDropdown = await fetchCustomerDetails(formData.customer.id);
          setDropdowns(prevDropdown => ({
            ...prevDropdown,
            contactPerson: contactDetailsDropdown?.[0]?.customer_contact?.map(data => ({
              id: data._id,
              label: data.contact_name,
              contactNo: data.contact_number.toString()
            })),
          }));
        } catch (error) {
          console.error('Error fetching contacts dropdown data:', error);
        }
      };

      fetchContactDetails();
    }
  }, [formData.customer]);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
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

  const submit = async () => {
    const fieldsToValidate = ['customer', 'dateAndTime', 'remarks', 'visitPurpose'];
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      const visitData = {
        employee_id: currentUser?.related_profile?._id,
        date_time: formData?.dateAndTime || null,
        customer_id: formData?.customer?.id,
        contact_no: formData?.contactPerson?.contactNo || null,
        // images: imageUrl || null,
        purpose_of_visit_id: formData?.visitPurpose?.id || null,
        remarks: formData?.remarks || null,
        site_location_id: formData?.siteLocation?.id || null,
        contact_person_id: formData?.contactPerson?.id || null,
        longitude: formData?.longitude || null,
        latitude: formData?.latitude || null,
        pipeline_id: pipelineId || null,
        visit_plan_id: visitPlanId || null,
      };
      console.log("🚀 ~ submit ~ visitData:", JSON.stringify(visitData, null, 2))
      try {
        const response = await post("/createCustomerVisitList", visitData);
        if (response.success) {
          showToast({
            type: "success",
            title: "Success",
            message: response.message || "Customer Visit created successfully",
          });
          navigation.goBack();
        } else {
          console.error("Customer Visit Failed:", response.message);
          showToast({
            type: "error",
            title: "ERROR",
            message: response.message || "Customer Visit creation failed",
          });
        }
      } catch (error) {
        console.error("Error creating Customer Visit Failed:", error);
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
        title="New Customer Visit"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer>
        <FormInput
          required
          label={"Date & Time"}
          dropIcon={"calendar"}
          editable={false}
          value={formatDate(formData.dateAndTime, 'dd-MM-yyyy hh:mm:ss')}
        />
        <FormInput
          label={"Customer Name"}
          placeholder={"Select Customer"}
          dropIcon={"menu-down"}
          editable={false}
          multiline={true}
          required
          value={formData.customer?.label}
          validate={errors.customer}
          onPress={() => toggleBottomSheet('Customers')}
        />
        <FormInput
          label={"Site/Location"}
          placeholder={"Select Site / Location"}
          dropIcon={"menu-down"}
          editable={false}
          value={formData.siteLocation?.label}
          validate={errors.siteLocation}
          onPress={() => isCustomerSelected ? toggleBottomSheet('Site Location') : showToastMessage('Select Customer !')}
        />
        <FormInput
          label={"Contact Person"}
          placeholder={"Contact person"}
          dropIcon={"menu-down"}
          validate={errors.cotactPerson}
          value={formData.contactPerson?.label}
          editable={false}
          onPress={() => isCustomerSelected ? toggleBottomSheet('Contact Person') : showToastMessage('Select Customer !')}
        />
        <FormInput
          label={"Contact No"}
          placeholder={"Contact person"}
          dropIcon={"menu-down"}
          editable={false}
          value={formData.contactPerson?.contactNo}
          onPress={() => isCustomerSelected ? null : showToastMessage('Select Customer !')}

        />
        <FormInput
          label={"Visit Purpose"}
          placeholder={"Select purpose of visit"}
          dropIcon={"menu-down"}
          editable={false}
          required
          value={formData.visitPurpose?.label}
          validate={errors.visitPurpose}
          onPress={() => toggleBottomSheet('Visit Purpose')}
        />
        <FormInput
          label={"Remarks"}
          placeholder={"Enter Remarks"}
          multiline={true}
          textAlignVertical='top'
          numberOfLines={5}
          required
          value={formData.remarks}
          validate={errors.remarks}
          onChangeText={(value) => handleFieldChange('remarks', value)}
        />
        {renderBottomSheet()}
        <LoadingButton title='SUBMIT' onPress={submit} loading={isSubmitting} />
      </RoundedScrollContainer>
      <OverlayLoader visible={isLoading} />
    </SafeAreaView>
  )
}
export default VisitForm

