import React, { useState, useEffect, useCallback } from 'react';
import { Keyboard, View, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { showToast } from '@utils/common';
import { put } from '@api/services/utils';
import { RoundedScrollContainer, UploadsContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import { fetchAssigneeDropdown, fetchCustomerNameDropdown, fetchDeviceDropdown, fetchBrandDropdown, fetchConsumerModelDropdown, fetchWarehouseDropdown, fetchSalesPersonDropdown } from '@api/dropdowns/dropdownApi';
import { formatDateTime } from '@utils/common/date';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { ActionModal } from '@components/Modal'
import SignaturePad from '@components/SignaturePad'
import { validateFields } from '@utils/validation';
import { CheckBox } from '@components/common/CheckBox';
import { formatDate } from '@utils/common/date';
import { AntDesign } from '@expo/vector-icons';
import { fetchPickupDetails } from '@api/details/detailApi';
import { useFocusEffect } from '@react-navigation/native';
import { OverlayLoader } from '@components/Loader';
import PickupScreen from './PickupScreen';

const EditPickupDetails = ({ navigation, route }) => {
  const { id: pickupId } = route?.params || {};
  const [isLoading, setIsLoading] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [formData, setFormData] = useState({});
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [imageLoading, setImageLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [dropdown, setDropdown] = useState({
    customerName: [],
    device: [],
    brand: [],
    consumerModel: [],
    warehouse: [],
    assignee: [],
    salesPerson: []
  });

  const fetchDetails = async (pickupId) => {
    setIsLoading(true);
    try {
      const [detail] = await fetchPickupDetails(pickupId);
      // console.log("🚀 ~ EditPickupDetails ~ detail:", JSON.stringify(detail, null, 2));
      setFormData((prevFormData) => ({
        ...prevFormData,
        date: detail?.date || new Date(),
        customerName: { id: detail?.customer_id || '', label: detail?.customer_name?.trim() || '' },
        device: { id: detail?.device_id || '', label: detail?.device_name || '' },
        brand: { id: detail?.brand_id || '', label: detail?.brand_name || '' },
        consumerModel: { id: detail?.consumer_model_id || '', label: detail?.consumer_model_name || '' },
        serialNumber: detail?.serial_no || '',
        warehouse: { id: detail?.warehouse_id || '', label: detail?.warehouse_name || '' },
        pickupScheduleTime: detail?.pickup_schedule_time || null,
        remarks: detail?.remarks || '',
        isShowCoordinatorSignaturePad: detail?.customer_signature && detail?.driver_signature,
        customerSignatureUrl: detail?.customer_signature || null,
        driverSignatureUrl: detail?.driver_signature || null,
        detailCoordinatorSignatureUrl: detail?.service_coordinator_signature || null,
        coordinatorSignatureUrl: detail?.service_coordinator_signature || null,
        imageUrls: detail?.attachment_details || [],
      }));
    } catch (error) {
      showToast({ type: 'error', title: 'Error', message: 'Failed to fetch pickup details. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (pickupId) {
        fetchDetails(pickupId);
      }
    }, [pickupId])
  );


  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const customerNameData = await fetchCustomerNameDropdown();
        const deviceData = await fetchDeviceDropdown();
        const warehouseData = await fetchWarehouseDropdown();
        const AssigneeData = await fetchAssigneeDropdown();
        const salesPersonData = await fetchSalesPersonDropdown();
        setDropdown((prevDropdown) => ({
          ...prevDropdown,
          customerName: customerNameData.map(data => ({
            id: data._id,
            label: data.name,
          })),
          device: deviceData.map(data => ({
            id: data._id,
            label: data.model_name,
          })),
          warehouse: warehouseData.map(data => ({
            id: data._id,
            label: data.warehouse_name,
          })),
          assignee: AssigneeData.map(data => ({
            id: data._id,
            label: data.name,
          })),
          salesPerson: salesPersonData.map(data => ({
            id: data._id,
            label: data.name,
          })),
        }));
      } catch (error) {
        console.error('Error fetching dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);


  useEffect(() => {
    if (formData.device) {
      const fetchBrandData = async () => {
        try {
          const brandData = await fetchBrandDropdown(formData.device.id);
          setDropdown(prevDropdown => ({
            ...prevDropdown,
            brand: brandData.map(data => ({
              id: data._id,
              label: data.brand_name,
            })),
          }));
        } catch (error) {
          console.error('Error fetching brand dropdown data:', error);
        }
      };
      fetchBrandData();
    }
  }, [formData.device]);

  useEffect(() => {
    if (formData.brand && formData.device) {
      const fetchconsumerModelData = async () => {
        try {
          const consumerModelData = await fetchConsumerModelDropdown(formData.device.id, formData.brand.id);
          setDropdown(prevDropdown => ({
            ...prevDropdown,
            consumerModel: consumerModelData.map(data => ({
              id: data._id,
              label: data.model_name,
            })),
          }));
        } catch (error) {
          console.error('Error Consumer Model dropdown data:', error);
        }
      };
      fetchconsumerModelData();
    }
  }, [formData.brand, formData.device]);

  const handleFieldChange = (field, value) => {
    setFormData((prevFormData) => ({ ...prevFormData, [field]: value }));
    if (errors[field]) {
      setErrors((prevErrors) => ({ ...prevErrors, [field]: null }));
    }
  };

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const handleDeleteImage = (index) => {
    const updatedImages = [...formData.imageUrls];
    updatedImages.splice(index, 1);
    handleFieldChange('imageUrls', updatedImages);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      setImageLoading(false);
    }, 1000);

    return () => clearTimeout(timeout);
  }, []);

  const validateForm = (fieldsToValidate) => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedType) {
      case 'Customer Name':
        items = dropdown.customerName;
        fieldName = 'customerName';
        break;
      case 'Device':
        items = dropdown.device;
        fieldName = 'device';
        break;
      case 'Brand':
        items = dropdown.brand;
        fieldName = 'brand';
        break;
      case 'Consumer Model':
        items = dropdown.consumerModel;
        fieldName = 'consumerModel';
        break;
      case 'Warehouse':
        items = dropdown.warehouse;
        fieldName = 'warehouse';
        break;
      case 'Assignee':
        items = dropdown.assignee;
        fieldName = 'assignee';
        break;
      case 'Sales Person':
        items = dropdown.salesPerson;
        fieldName = 'salesPerson';
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

  const handleSubmit = async () => {
    const fieldsToValidate = ['device', 'brand'];
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      const pickupData = {
        _id: pickupId,
        date: formatDate(formData.date, 'yyyy-MM-dd'),
        device_id: formData?.device?.id ?? null,
        device_name: formData?.device?.label ?? null,
        brand_id: formData?.brand?.id ?? null,
        brand_name: formData?.brand?.label ?? null,
        consumer_model_id: formData?.consumerModel?.id ?? null,
        consumer_model_name: formData?.consumerModel?.label ?? null,
        serial_no: formData?.serialNumber || null,
        warehouse_id: formData?.warehouse?.id ?? null,
        warehouse_name: formData?.warehouse?.label ?? null,
        customer_id: formData?.customerName?.id ?? null,
        customer_name: formData?.customerName?.label ?? null,
        is_pickup: false,
        pickup_schedule_time: formData?.pickupScheduleTime || null,
        assignee_id: formData?.assignee?.id ?? null,
        assignee_name: formData?.assignee?.label ?? null,
        sales_person_id: formData?.salesPerson?.id ?? null,
        sales_person_name: formData?.salesPerson?.label ?? null,
        driver_signature: formData?.driverSignatureUrl || null,
        customer_signature: formData?.customerSignatureUrl || null,
        service_coordinator_signature: formData?.coordinatorSignatureUrl || null,
        remarks: formData?.remarks || null,
        attachment_details: formData?.imageUrls.length > 0 ? imageUrls : [],
        // below 5 values are not in the forminput 
        // warranty_date: null,
        // contact_number: null,
        // customer_email: null,
        // address: null,
        // tracking_no: null,
      };
      console.log("🚀 ~ EditPickupDetails ~ pickupData:", JSON.stringify(pickupData, null, 2));
      try {
        const response = await put("/updateJobBooking", pickupData);
        // console.log("🚀 ~ file: EditPickupDetails.js:286 ~ handleSubmit ~ response:", response.data)
        if (response.message) {
          showToast({
            type: "success", title: "Success",
            message: response.message || "Pickup Updated Successfully",
          });
          navigation.navigate('PickupScreen');
        } else {
          showToast({
            type: "error", title: "Error",
            message: response.message || "Pickup Update failed",
          });
        }
      } catch (error) {
        showToast({
          type: "error", title: "Error",
          message: "An unexpected error occurred. Please try again later.",
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const ListAction = ({ image, onPress, index }) => {
    return (
      <View style={styles.listContainer} onPress={onPress}>
        {imageLoading && <ActivityIndicator size="small" color={'black'} style={{ position: 'absolute', top: 30 }} />}
        <Image source={{ uri: image }} style={styles.image}
          onLoad={() => setImageLoading(true)} // upload container
        />
        <View style={styles.deleteIconContainer}>
          <TouchableOpacity onPress={() => handleDeleteImage(index)}>
            <AntDesign name="delete" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderItem = ({ index, item }) => {
    if (item.empty) {
      return <View style={[styles.itemStyle, styles.itemInvisible]} />
    }
    return <ListAction image={item} index={index} />;
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Edit Pickup"
        onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer scrollEnabled={scrollEnabled} >
        <FormInput
          label="Date"
          dropIcon="calendar"
          editable={false}
          value={formatDate(formData.date)}
        />
        <FormInput
          label={"Customer Name"}
          placeholder={"Select Customer Name"}
          dropIcon={"menu-down"}
          editable={false}
          validate={errors.customerName}
          value={formData.customerName?.label}
          onPress={() => toggleBottomSheet('Customer Name')}
        />
        <FormInput
          label={"Device"}
          placeholder={"Select Device"}
          dropIcon={"menu-down"}
          editable={false}
          required
          validate={errors.device}
          value={formData.device?.label}
          onPress={() => toggleBottomSheet('Device')}
        />
        <FormInput
          label={"Brand"}
          placeholder={"Select Brand"}
          dropIcon={"menu-down"}
          editable={false}
          required
          validate={errors.brand}
          value={formData.brand?.label}
          onPress={() => toggleBottomSheet('Brand')}
        />
        <FormInput
          label={"Consumer Model"}
          placeholder={"Select Consumer Model"}
          dropIcon={"menu-down"}
          editable={false}
          validate={errors.consumerModel}
          value={formData.consumerModel?.label}
          onPress={() => toggleBottomSheet('Consumer Model')}
        />
        <FormInput
          label={"Serial Number"}
          placeholder={"Enter Serial Number"}
          editable={true}
          keyboardType="numeric"
          validate={errors.serialNumber}
          onChangeText={(value) => handleFieldChange('serialNumber', value)}
        />
        <FormInput
          label={"Warehouse"}
          placeholder={"Select Warehouse"}
          dropIcon={"menu-down"}
          editable={false}
          validate={errors.warehouse}
          value={formData.warehouse?.label}
          onPress={() => toggleBottomSheet('Warehouse')}
        />
        <CheckBox
          label="From Website Pickup"
          checked={formData.isActive}
          onPress={() => handleFieldChange('isActive', !formData.isActive)}
        />
        <FormInput
          label={"Pickup Scheduled Time"}
          placeholder={"Select Pickup Scheduled Time"}
          dropIcon={"clock-outline"}
          editable={false}
          value={formatDateTime(formData.pickupScheduleTime)}
          onPress={() => setIsDatePickerVisible(true)}
        />
        <FormInput
          label={"Assignee"}
          placeholder={"Select Assignee"}
          dropIcon={"menu-down"}
          editable={false}
          validate={errors.assignee}
          value={formData.assignee?.label}
          onPress={() => toggleBottomSheet('Assignee')}
        />
        <FormInput
          label={"Sales Person"}
          placeholder={"Select Sales Person"}
          dropIcon={"menu-down"}
          editable={false}
          validate={errors.salesPerson}
          value={formData.salesPerson?.label}
          onPress={() => toggleBottomSheet('Sales Person')}
        />
        <SignaturePad
          setScrollEnabled={setScrollEnabled}
          title={'Customer Signature'}
          previousSignature={formData.customerSignatureUrl}
        />
        <SignaturePad
          setScrollEnabled={setScrollEnabled}
          title={'Driver Signature'}
          previousSignature={formData.driverSignatureUrl}
        />
        {formData?.isShowCoordinatorSignaturePad
          && <SignaturePad
            setScrollEnabled={setScrollEnabled}
            setUrl={(url) => handleFieldChange('coordinatorSignatureUrl', url)}
            title={'Co-Ordinator Signature'}
            previousSignature={formData.detailCoordinatorSignatureUrl}
          />}
        <FormInput
          label={"Remarks"}
          placeholder={"Enter Remarks"}
          editable={true}
          multiline={true}
          onChangeText={(value) => handleFieldChange('remarks', value)}
        />
        <ActionModal
          title="Attach file"
          setImageUrl={(url) => handleFieldChange('imageUrls', [...formData.imageUrls, url])} />
        {formData?.imageUrls && formData?.imageUrls?.length > 0 && (
          <UploadsContainer imageUrls={formData.imageUrls} onDelete={handleDeleteImage} />)}
        {renderBottomSheet()}
        <LoadingButton title="SAVE" onPress={handleSubmit} marginTop={10} loading={isSubmitting} />
        <View style={{ marginBottom: 10 }} />
        <OverlayLoader visible={isLoading} />
        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="datetime"
          onConfirm={(value) => handleFieldChange('pickupScheduleTime', value)}
          onCancel={() => setIsDatePickerVisible(false)}
        />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default EditPickupDetails;