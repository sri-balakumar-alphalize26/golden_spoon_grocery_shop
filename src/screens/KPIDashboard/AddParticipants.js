import React, { useEffect, useState } from 'react';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { fetchEmployeesDropdown } from '@api/dropdowns/dropdownApi';
import { MultiSelectDropdownSheet } from '@components/common/BottomSheets';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { COLORS } from '@constants/theme';
import { Keyboard } from 'react-native';
import { validateFields } from '@utils/validation';
import { put } from '@api/services/utils';

const AddParticipants = ({ navigation, route }) => {
    const { id } = route.params || {};
    const [details, setDetails] = useState({});
    const [selectedType, setSelectedType] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [errors, setErrors] = useState({});
    const [dropdown, setDropdown] = useState({ employee: [] });
    const [formData, setFormData] = useState({ employee: [] });

    useEffect(() => {
        const fetchDropdownData = async () => {
            try {
                const EmployeeData = await fetchEmployeesDropdown();
                setDropdown(prevDropdown => ({
                    ...prevDropdown,
                    employee: EmployeeData.map(data => ({
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

    const validateForm = (fieldsToValidate) => {
        Keyboard.dismiss();
        const { isValid, errors } = validateFields(formData, fieldsToValidate);
        setErrors(errors);
        return isValid;
    };

    const handleAddParticipants = async () => {
        const fieldsToValidate = ['employee'];
        if (validateForm(fieldsToValidate)) {
            const participantData = {
                _id: details._id || id,
                participants: selectedEmployees.map(emp => ({
                    assignee_id: emp.id,
                    assignee_name: emp.label.trim(),
                })),
            };
            try {
                const response = await put('/updateKpiTasks', participantData);
                console.log('Participant response:', response);
                navigation.navigate('KPIActionDetails', {id});
            } catch (error) {
                console.error('Error Adding Participants:', error);
            }
        }
    }

    const handleEmployeeSelection = (selectedValues) => {
        setSelectedEmployees(selectedValues);
        setFormData(prevFormData => ({
            ...prevFormData,
            employee: selectedValues,
        }));
        // setIsVisible(false);
    };

    const renderBottomSheet = () => {
        let items = [];
        let fieldName = '';
        let previousSelections = [];

        switch (selectedType) {
            case 'Employee':
                items = dropdown.employee;
                fieldName = 'employee';
                previousSelections = formData.employee;
                break;
            default:
                return null;
        }
        return (
            <MultiSelectDropdownSheet
                isVisible={isVisible}
                items={items}
                refreshIcon={true}
                title={selectedType}
                previousSelections={formData.employee}
                onClose={() => setIsVisible(false)}
                onValueChange={handleEmployeeSelection}
                // previousSelections={previousSelections}
            />
        );
    };

    return (
      <SafeAreaView>
          <NavigationHeader
              title="Add Participants"
              onBackPress={() => navigation.goBack()}
          />
          <RoundedScrollContainer>
              <FormInput
                  label={"Employee"}
                  placeholder={"Select Employee"}
                  dropIcon={"menu-down"}
                  items={dropdown.employee}
                  editable={false}
                  multiline={true}
                  textAlignVertical="top"
                  marginTop={10}
                  validate={errors.employee}
                  value={selectedEmployees.map(emp => emp.label).join(', ')}
                  onPress={() => toggleBottomSheet('Employee')}
              />
              <Button
                  title={'Add Participants'}
                  width={'50%'}
                  alignSelf={'center'}
                  backgroundColor={COLORS.primaryThemeColor}
                  onPress={handleAddParticipants}
              />
              {renderBottomSheet()}
          </RoundedScrollContainer>
      </SafeAreaView>
  );
};

export default AddParticipants;