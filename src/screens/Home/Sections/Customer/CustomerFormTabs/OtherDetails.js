import React, { useState, useEffect } from 'react';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import { CheckBox } from '@components/common/CheckBox';
import { fetchLanguageDropdown, fetchCurrencyDropdown } from '@api/dropdowns/dropdownApi';
import { customerBehaviour, customerAttitude } from '@constants/dropdownConst';

const OtherDetails = ({ formData, onFieldChange, errors }) => {

  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [dropdown, setDropdown] = useState({
    customerAttitude: [],
    customerBehaviour: [],
    language: [],
    currency: [],
  });

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const languageData = await fetchLanguageDropdown();
        setDropdown(prevDropdown => ({
          ...prevDropdown,
          language: languageData.map(data => ({
            id: data._id,
            label: data.language_name,
          })),
        }));
      } catch (error) {
        console.error('Error fetching language dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const currencyData = await fetchCurrencyDropdown();
        setDropdown(prevDropdown => ({
          ...prevDropdown,
          currency: currencyData.map(data => ({
            id: data._id,
            label: data.currency_name,
          })),
        }));
      } catch (error) {
        console.error('Error fetching currency dropdown data:', error);
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
      case 'Customer Behaviour':
        items = customerBehaviour;
        fieldName = 'customerBehaviour';
        break;
      case 'Customer Attitude':
        items = customerAttitude;
        fieldName = 'customerAttitude';
        break;
      case 'Language':
        items = dropdown.language;
        fieldName = 'language';
        break;
      case 'Currency':
        items = dropdown.currency;
        fieldName = 'currency';
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
        label={"TRN No "}
        placeholder={"Enter TRN"}
        editable={true}
        keyboardType="numeric"
        validate={errors.trn}
        onChangeText={(value) => onFieldChange('trn', value)}
      />
      <FormInput
        label={"Customer Behaviour"}
        placeholder={"Select Customer Behaviour"}
        dropIcon={"menu-down"}
        items={customerBehaviour}
        editable={false}
        validate={errors.customerBehaviour}
        value={formData.customerBehaviour?.label}
        onPress={() => toggleBottomSheet('Customer Behaviour')}
      />
      <CheckBox
        label="Is Active"
        checked={formData.isActive}
        onPress={() => onFieldChange('isActive', !formData.isActive)}
      />
      <FormInput
        label={"Customer Attitude "}
        placeholder={"Select Customer Attitude"}
        dropIcon={"menu-down"}
        items={customerAttitude}
        editable={false}
        validate={errors.customerAttitude}
        value={formData.customerAttitude?.label}
        onPress={() => toggleBottomSheet('Customer Attitude')}
      />
      <FormInput
        label={"Language "}
        placeholder={"Select Language"}
        dropIcon={"menu-down"}
        editable={false}
        validate={errors.language}
        value={formData.language?.label}
        onPress={() => toggleBottomSheet('Language')}
      />
      <FormInput
        label={"Currency "}
        placeholder={"Select Currency"}
        dropIcon={"menu-down"}
        editable={false}
        validate={errors.currency}
        value={formData.currency?.label}
        onPress={() => toggleBottomSheet('Currency')}
      />
      <CheckBox
        label="Is Supplier "
        checked={formData.isSupplier}
        onPress={() => onFieldChange('isSupplier', !formData.isSupplier)}
      />
      {renderBottomSheet()}
    </RoundedScrollContainer>
  )
}

export default OtherDetails;
