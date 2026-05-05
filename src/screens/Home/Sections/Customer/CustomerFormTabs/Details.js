import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';

import { fetchSalesPersonDropdown, fetchCollectionAgentDropdown } from '@api/dropdowns/dropdownApi';
import { customerTypes } from '@constants/dropdownConst';
import { customerTitles } from '@constants/dropdownConst';
import { modeOfPayment } from '@constants/dropdownConst';

const Details = ({ formData, onFieldChange, errors }) => {
  const navigation = useNavigation();

  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);

  const [dropdown, setDropdown] = useState({
    salesPerson: [],
    customerTypes: [],
    collectionAgent: [],
  });

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const salesPersonData = await fetchSalesPersonDropdown();
        setDropdown(prevDropdown => ({
          ...prevDropdown,
          salesPerson: salesPersonData.map(data => ({
            id: data._id,
            label: data.name,
          })),
        }));
      } catch (error) {
        console.error('Error fetching sales person dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const collectionAgentData = await fetchCollectionAgentDropdown();
        setDropdown(prevDropdown => ({
          ...prevDropdown,
          collectionAgent: collectionAgentData.map(data => ({
            id: data._id,
            label: data.name,
          })),
        }));
      } catch (error) {
        console.error('Error fetching sales person dropdown data:', error);
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
      case 'Customer Type':
        items = customerTypes;
        fieldName = 'customerTypes';
        break;
      case 'Customer Title':
        items = customerTitles;
        fieldName = 'customerTitles';
        break;
      case 'Sales Person':
        items = dropdown.salesPerson;
        fieldName = 'salesPerson';
        break;
      case 'Collection Agent':
        items = dropdown.collectionAgent;
        fieldName = 'collectionAgent';
        break;
      case 'MOP (Mode Of Payment)':
        items = modeOfPayment;
        fieldName = 'modeOfPayment';
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

  // 🔹 Navigate to OCR screen
  const handleOpenOcr = () => {
    navigation.navigate('LiveOcr');
  };

  return (
    <RoundedScrollContainer>
      {/* 🔹 OCR Button for scanning business cards */}
      <TouchableOpacity style={styles.ocrButton} onPress={handleOpenOcr}>
        <Text style={styles.ocrButtonText}>Scan with OCR</Text>
      </TouchableOpacity>

      <FormInput
        label={"Customer Type "}
        placeholder={"Select Customer Type"}
        dropIcon={"menu-down"}
        items={customerTypes}
        editable={false}
        required
        validate={errors.customerTypes}
        value={formData.customerTypes?.label}
        onPress={() => toggleBottomSheet('Customer Type')}
      />
      <FormInput
        label={"Customer Name "}
        placeholder={"Enter Customer Name"}
        editable={true}
        required
        value={formData.customerName}
        validate={errors.customerName}
        onChangeText={(value) => onFieldChange('customerName', value)}
      />
      <FormInput
        label={"Customer Title "}
        placeholder={"Select Customer Title"}
        dropIcon={"menu-down"}
        items={customerTitles}
        editable={false}
        required
        validate={errors.customerTitles}
        value={formData.customerTitles?.label}
        onPress={() => toggleBottomSheet('Customer Title')}
      />
      <FormInput
        label={"Email Address "}
        placeholder={"Enter Email Address"}
        editable={true}
        validate={errors.emailAddress}
        onChangeText={(value) => onFieldChange('emailAddress', value)}
      />
      <FormInput
        label={"Sales Person "}
        placeholder={"Select Sales Person"}
        dropIcon={"menu-down"}
        editable={false}
        validate={errors.salesPerson}
        value={formData.salesPerson?.label}
        onPress={() => toggleBottomSheet('Sales Person')}
      />
      <FormInput
        label={"Collection Agent "}
        placeholder={"Enter Collection Agent"}
        dropIcon={"menu-down"}
        editable={false}
        validate={errors.collectionAgent}
        value={formData.collectionAgent?.label}
        onPress={() => toggleBottomSheet('Collection Agent')}
      />
      <FormInput
        label={"MOP (Mode Of Payment) "}
        placeholder={"Select MOP"}
        dropIcon={"menu-down"}
        editable={false}
        required
        validate={errors.modeOfPayment}
        value={formData.modeOfPayment?.label}
        onPress={() => toggleBottomSheet('MOP (Mode Of Payment)')}
      />
      <FormInput
        label={"Mobile Number "}
        placeholder={"Enter Mobile Number"}
        editable={true}
        keyboardType="numeric"
        required
        validate={errors.mobileNumber}
        onChangeText={(value) => onFieldChange('mobileNumber', value)}
      />
      <FormInput
        label={"Whatsapp Number "}
        placeholder={"Enter Whatsapp Number"}
        editable={true}
        keyboardType="numeric"
        validate={errors.whatsappNumber}
        onChangeText={(value) => onFieldChange('whatsappNumber', value)}
      />
      <FormInput
        label={"Landline Number "}
        placeholder={"Enter Landline Number"}
        editable={true}
        keyboardType="numeric"
        validate={errors.landlineNumber}
        onChangeText={(value) => onFieldChange('landlineNumber', value)}
      />
      <FormInput
        label={"Fax "}
        placeholder={"Enter Fax "}
        editable={true}
        keyboardType="numeric"
        validate={errors.fax}
        onChangeText={(value) => onFieldChange('fax', value)}
      />
      {renderBottomSheet()}
    </RoundedScrollContainer>
  );
};

export default Details;

const styles = StyleSheet.create({
  ocrButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  ocrButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
