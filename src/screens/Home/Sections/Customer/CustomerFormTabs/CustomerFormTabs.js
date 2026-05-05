import * as React from 'react';
import { useWindowDimensions, KeyboardAvoidingView, Platform, Keyboard, View } from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useState } from 'react';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { showToast } from '@utils/common';
import { post } from '@api/services/utils';
import { validateFields } from '@utils/validation';
import { CustomTabBar } from '@components/TabBar';
import Details from './Details';
import OtherDetails from './OtherDetails';
import Address from './Address';
import ContactPerson from './ContactPerson';

const CustomerFormTabs = ({ navigation }) => {
  
  const layout = useWindowDimensions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'first', title: 'Details' },
    { key: 'second', title: 'Other Details' },
    { key: 'third', title: 'Address' },
    { key: 'fourth', title: 'Contact Person' }
  ]);
  const [formData, setFormData] = useState({
    customerTypes: "",
    customerName: "",
    customerTitles: "",
    emailAddress: "",
    salesPerson: "",
    collectionAgent: "",
    modeOfPayment: "",
    phoneNumber: "",
    whatsappNumber: "",
    landlineNumber: "",
    fax: "",
    trn: null,
    customerBehaviour: "",
    customerAttitude: "",
    language: "",
    currency: "",
    isActive: false,
    isSupplier: false,
    address: "",
    country: "",
    state: "",
    area: "",
    poBox: "",
  });

  const [errors, setErrors] = useState({});

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

  console.log("🚀 ~ CustomerFormTabs ~ formData:", JSON.stringify(formData, null, 2));

  const renderScene = ({ route }) => {
    switch (route.key) {
      case 'first':
        return <Details formData={formData} onFieldChange={handleFieldChange} errors={errors} />;
      case 'second':
        return <OtherDetails formData={formData} onFieldChange={handleFieldChange} errors={errors} />;
      case 'third':
        return <Address formData={formData} onFieldChange={handleFieldChange} errors={errors} />;
      case 'fourth':
        return <ContactPerson formData={formData} onFieldChange={handleFieldChange} errors={errors} />;
      default:
        return null;
    }
  };

  const validateForm = (fieldsToValidate) => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const handleSubmit = async () => {
    const fieldsToValidate = ['customerTypes', 'customerName', 'customerTitles', 'modeOfPayment', 'mobileNumber', 'address'];
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      const customerData = {
        customer_type: formData?.customerTypes?.label ?? null,
        name: formData?.customerName || null,
        customer_title: formData?.customerTitles?.label ?? null,
        customer_email: formData?.emailAddress || null,
        sales_person_id: formData?.salesPerson.id ?? null,
        collection_agent_id: formData?.collectionAgent?.id ?? null,
        mode_of_payment: formData?.modeOfPayment?.value ?? null,
        customer_mobile: formData?.mobileNumber || null,
        whatsapp_no: formData?.whatsappNumber || null,
        land_phone_no: formData?.landlineNumber || null,
        fax: formData?.fax || null,
        is_active: formData?.isActive,
        is_supplier: formData?.isSupplier,
        trn_no: parseInt(formData?.trn, 10) || null,
        customer_behaviour: formData?.customerBehaviour?.value ?? null,
        customer_atitude: formData?.customerAttitude?.value ?? null,
        language_id: formData?.language?.id ?? null,
        currency_id: formData?.currency?.id ?? null,
        address: formData?.address || null,
        country_id: formData?.country?.id ?? null,
        state_id: formData?.state?.id ?? null,
        area_id: formData?.area?.id ?? null,
        po_box: formData?.poBox || null,
      };
      console.log("🚀 ~ submit ~ customerData:", JSON.stringify(customerData, null, 2));

      try {
        const response = await post("/createCustomer", customerData);
        console.log("🚀 ~ submit ~ response:", response);
        if (response.success === 'true') {
          showToast({
            type: "success",
            title: "Success",
            message: response.message || "Customer created successfully",
          });
          navigation.navigate("CustomerScreen");
        } else {
          console.error("Customer Failed:", response.message);
          showToast({
            type: "error",
            title: "ERROR",
            message: response.message || "Customer creation failed",
          });
        }
      } catch (error) {
        console.error("Error Creating Customer Failed:", error);
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
        title="Add Customer"
        onBackPress={() => navigation.goBack()}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : null} style={{ flex: 1 }}>
        <TabView
          navigationState={{ index, routes }}
          renderScene={renderScene}
          renderTabBar={props => <CustomTabBar {...props} />} onIndexChange={setIndex}
          initialLayout={{ width: layout.width }}
        />
      </KeyboardAvoidingView>
      <View style={{ backgroundColor: 'white', paddingHorizontal: 50, paddingBottom: 12 }}>
        <LoadingButton onPress={handleSubmit} title={'Submit'} loading={isSubmitting} />
      </View>
    </SafeAreaView>
  );
};

export default CustomerFormTabs;
