import React, { useState, useEffect } from 'react';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import { fetchWarehouseDropdown } from '@api/dropdowns/dropdownApi';
import { formatDateandTime } from '@utils/common/date';

const DateDetails = ({ formData, onFieldChange, errors }) => {

  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [dropdown, setDropdown] = useState({
    warehouse: [],
  });

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
        console.error('Error fetching Warehouse dropdown data:', error);
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
    );
  };

  return (
    <RoundedScrollContainer>
      <FormInput
        label="Date"
        editable={false}
        value={formatDateandTime(formData.date)}
      />
      <FormInput
        label={"TRN Number"}
        placeholder={"Enter TRN Number"}
        editable={true}
        keyboardType="numeric"
        onChangeText={(value) => onFieldChange('trnnumber', value)}
      />
      <FormInput
        label="Order Date"
        editable={false}
        value={formatDateandTime(formData.orderDate)}
      />
      <FormInput
        label="Bill Date"
        editable={false}
        value={formatDateandTime(formData.billDate)}
      />
      <FormInput
        label={"Sales Person"}
        placeholder={"Select Sales Person"}
        editable={false}
        required
        validate={errors.salesPerson}
        value={formData.salesPerson?.label}
      />
      <FormInput
        label={"Warehouse"}
        placeholder={"Select Warehouse"}
        dropIcon={"menu-down"}
        editable={false}
        required
        validate={errors.warehouse}
        value={formData.warehouse?.label}
        onPress={() => toggleBottomSheet('Warehouse')}
      />
      {renderBottomSheet()}
    </RoundedScrollContainer>
  )
}

export default DateDetails;