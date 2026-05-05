import React, { useEffect, useState } from 'react';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { fetchCountryDropdown, fetchStateDropdown, fetchAreaDropdown } from '@api/dropdowns/dropdownApi';
import { DropdownSheet } from '@components/common/BottomSheets';

const Address = ({ formData, onFieldChange, errors }) => {

  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);

  const [dropdown, setDropdown] = useState({
    country: [],
    state: [],
    area: [],
  });

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const countryData = await fetchCountryDropdown();
        setDropdown(prevDropdown => ({
          ...prevDropdown,
          country: countryData.map(data => ({
            id: data._id,
            label: data.country_name,
          })),
        }));
      } catch (error) {
        console.error('Error fetching country dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);

  useEffect(() => {
    if (formData.country) {
      const fetchStateData = async () => {
        try {
          const stateData = await fetchStateDropdown(formData.country.id);
          setDropdown(prevDropdown => ({
            ...prevDropdown,
            state: stateData.map(data => ({
              id: data._id,
              label: data.state_name,
            })),
          }));
        } catch (error) {
          console.error('Error fetching state dropdown data:', error);
        }
      };

      fetchStateData();
    }
  }, [formData.country]);

  useEffect(() => {
    if (formData.state) {
      const fetchAreaData = async () => {
        try {
          const areaData = await fetchAreaDropdown(formData.state.id);
          setDropdown(prevDropdown => ({
            ...prevDropdown,
            area: areaData.map(data => ({
              id: data._id,
              label: data.area_name,
            })),
          }));
        } catch (error) {
          console.error('Error fetching area dropdown data:', error);
        }
      };

      fetchAreaData();
    }
  }, [formData.state]);

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedType) {
      case 'Country':
        items = dropdown.country;
        fieldName = 'country';
        break;
      case 'State':
        items = dropdown.state;
        fieldName = 'state';
        break;
      case 'Area':
        items = dropdown.area;
        fieldName = 'area';
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
        label= {"Address "}
        placeholder={"Enter Address"}
        editable={true}
        required
        validate={errors.address}        
        onChangeText={(value) => onFieldChange('address', value)}
      />
      <FormInput
        label= "Country "
        placeholder="Select Country"
        dropIcon="menu-down"
        editable={false}
        validate={errors.country}
        value={formData.country?.label}
        onPress={() => toggleBottomSheet("Country")} 
      />
      <FormInput
        label= "State "
        placeholder="Select State"
        dropIcon="menu-down"
        editable={false}
        validate={errors.state}
        value={formData.state?.label}
        onPress={() => toggleBottomSheet("State")}
      />
      <FormInput
        label= "Area "
        placeholder="Select Area"
        dropIcon="menu-down"
        editable={false}
        validate={errors.area}
        value={formData.area?.label}
        onPress={() => toggleBottomSheet("Area")}
      />
      <FormInput
        label= {"PO Box "}
        placeholder="Enter PO Box"
        editable={true}
        validate={errors.poBox}
        onChangeText={(value) => onFieldChange('poBox', value)}
      />
      {renderBottomSheet()}
    </RoundedScrollContainer>
  );
};

export default Address;
