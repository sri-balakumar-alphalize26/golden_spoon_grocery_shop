import React, { useState, useEffect } from 'react';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import { fetchDeviceDropdown, fetchBrandDropdown, fetchConsumerModelDropdown } from '@api/dropdowns/dropdownApi';

const Product = ({ formData, onFieldChange, errors }) => {

  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);

  const [dropdown, setDropdown] = useState({
    device: [],
    brand: [],
    customerModel: [],
  });
  
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const deviceData = await fetchDeviceDropdown();
        setDropdown(prevDropdown => ({
          ...prevDropdown,
          device: deviceData.map(data => ({
            id: data._id,
            label: data.model_name,
          })),
        }));
      } catch (error) {
        console.error('Error fetching device dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);
      
  useEffect(() => {
    if (formData.device){
    const fetchBrandData = async () => {
      try {
        const brandData = await fetchBrandDropdown(formData.device.id);
        console.log(brandData)
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
    if (formData.brand && formData.device){
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
        console.error('Error warehouse dropdown data:', error);
      }
    };
    fetchconsumerModelData();
  }
  }, [formData.brand, formData.device]);

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';
  
    switch (selectedType) {
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
      default:
        return null;
    }
    return (
      <DropdownSheet
        isVisible={isVisible}
        items={items}
        title={selectedType}
        onClose={() => setIsVisible(false)}
        onValueChange={(value) => onFieldChange(fieldName, value)}
      />
    );
  };

  return (
    <RoundedScrollContainer>
      <FormInput
        label={"Device"}
        placeholder={"Select Device"}
        dropIcon={"menu-down"}
        items={dropdown.device}
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
        items={dropdown.brand}
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
        items={dropdown.consumerModel}
        editable={false}
        required
        validate={errors.consumerModel}
        value={formData.consumerModel?.label}
        onPress={() => toggleBottomSheet('Consumer Model')}
      />
      <FormInput
        label={"Serial Number"}
        placeholder={"Enter Serial Number"}
        editable={true}
        required
        keyboardType="numeric"
        validate={errors.serialNumber}
        onChangeText={(value) => onFieldChange('serialNumber', value)}
      />
      <FormInput
        label={"IMEI Number"}
        placeholder={"Enter IMEI Number"}
        editable={true}
        keyboardType="numeric"
        onChangeText={(value) => onFieldChange('imeiNumber', value)}
      />
      {renderBottomSheet()}
    </RoundedScrollContainer>
  )
}

export default Product;
