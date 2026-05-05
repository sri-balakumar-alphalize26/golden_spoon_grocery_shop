import React, { useState, useEffect } from 'react';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import { fetchAssigneeDropdown } from '@api/dropdowns/dropdownApi';

const Assignee = ({ formData, onFieldChange, errors }) => {

  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);

  const [dropdown, setDropdown] = useState({
    assignedTo: [],
  });

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const AssigneeData = await fetchAssigneeDropdown();
        setDropdown(prevDropdown => ({
          ...prevDropdown,
          assignedTo: AssigneeData.map(data => ({
            id: data._id,
            label: data.name,
          })),
        }));
      } catch (error) {
        console.error('Error fetching Assignee dropdown data:', error);
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
      case 'Assigned To':
        items = dropdown.assignedTo;
        fieldName = 'assignedTo';
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
        label={"Assigned To"}
        placeholder={"Select Assigned To"}
        dropIcon={"menu-down"}
        items={dropdown.assignedTo}
        editable={false}
        required
        validate={errors.assignedTo}
        value={formData.assignedTo?.label}
        onPress={() => toggleBottomSheet('Assigned To')}
      />
      <FormInput
        label={"Pre Condition"}
        placeholder={"Enter Pre Condition"}
        editable={true}
        onChangeText={(value) => onFieldChange('preCondition', value)}
      />
      <FormInput
        label={"Estimation"}
        placeholder={"Enter Estimation"}
        editable={true}
        keyboardType="numeric"
        onChangeText={(value) => onFieldChange('estimation', value)}
      />
      <FormInput
        label="Remarks"
        placeholder="Enter Remarks"
        editable={true}
        multiline={true}
        numberOfLines={5}
        textAlignVertical="top"
        marginTop={10}
        onChangeText={(value) => onFieldChange('remarks', value)}
      />
      {renderBottomSheet()}
    </RoundedScrollContainer>
  )
}

export default Assignee;