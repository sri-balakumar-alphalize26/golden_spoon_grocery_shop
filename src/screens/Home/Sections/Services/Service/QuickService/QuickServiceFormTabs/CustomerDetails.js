import React, { useState, useEffect } from 'react';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { fetchCustomerNameDropdown, fetchWarehouseDropdown } from '@api/dropdowns/dropdownApi';
import { DropdownSheet } from '@components/common/BottomSheets';

const CustomerDetails = ({ formData, onFieldChange, errors }) => {

  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);

  const [dropdown, setDropdown] = useState({
    customerName: [],
    warehouse: [],
  });
  
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const customerNameData = await fetchCustomerNameDropdown();
        setDropdown(prevDropdown => ({
          ...prevDropdown,
          customerName: customerNameData.map(data => ({
            id: data._id,
            label: data.name,
            customer_mobile: data.customer_mobile,
            customer_email: data.customer_email,
            trn_no: data.trn_no,
            address: data.address,  // Assuming there's an address field
          })),
        }));
      } catch (error) {
        console.error('Error fetching customer dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const warehouseData = await fetchWarehouseDropdown();
        setDropdown(prevDropdown => ({
          ...prevDropdown,
          warehouse: warehouseData.map(data => ({
            id: data._id,
            label: data.warehouse_name,
          })),
        }));
      } catch (error) {
        console.error('Error warehouse dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedType) {
      case 'Customer Name':
        items = dropdown.customerName;
        fieldName = 'customerName';
        break;
      case 'Warehouse':
        items = dropdown.warehouse;
        fieldName = 'warehouse';
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
      // <DropdownSheet
      //   isVisible={isVisible}
      //   items={items}
      //   title={selectedType}
      //   onClose={() => setIsVisible(false)}
      //   onValueChange={(selectedCustomer) => {
      //     onFieldChange('customerName', selectedCustomer);
      //     if (fieldName === 'customerName') {
      //       // Auto-fill related fields when a customer is selected
      //       onFieldChange('phoneNumber', selectedCustomer.customer_mobile);
      //       onFieldChange('emailAddress', selectedCustomer.customer_email);
      //       onFieldChange('address', selectedCustomer.address);
      //       onFieldChange('trn', selectedCustomer.trn_no);
      //     }
      //   }}
      // />
    );
  };

  return (
    <RoundedScrollContainer>
      <FormInput
        label={"Customer Name"}
        placeholder={"Select Customer Name"}
        dropIcon={"menu-down"}
        items={dropdown.customerName}
        editable={false}
        required
        multiline={true}
        validate={errors.customerName}
        value={formData.customerName?.label}
        onPress={() => toggleBottomSheet('Customer Name')}
      />
      <FormInput
        label={"Phone Number"}
        placeholder={"Enter Phone Number"}
        editable={true}
        required
        keyboardType="numeric"
        validate={errors.phoneNumber}
        value={formData.phoneNumber}
        onChangeText={(value) => onFieldChange('phoneNumber', value)}
      />
      <FormInput
        label={"Email "}
        placeholder={"Enter Email Address"}
        editable={true}
        value={formData.emailAddress}
        onChangeText={(value) => onFieldChange('emailAddress', value)}
      />
      <FormInput
        label={"Address "}
        placeholder={"Enter Address"}
        editable={true}
        value={formData.address}
        onChangeText={(value) => onFieldChange('address', value)}
      />
      <FormInput
        label={"TRN No "}
        placeholder={"Enter TRN"}
        editable={true}
        keyboardType="numeric"
        value={formData.trn}
        onChangeText={(value) => onFieldChange('trn', value)}
      />
      <FormInput
        label={"Warehouse"}
        placeholder={"Select Warehouse"}
        dropIcon={"menu-down"}
        items={dropdown.warehouse}
        editable={false}
        validate={errors.warehouse}
        value={formData.warehouse?.label}
        onPress={() => toggleBottomSheet('Warehouse')}
      />
      {renderBottomSheet()}
    </RoundedScrollContainer>
  );
};

export default CustomerDetails;
