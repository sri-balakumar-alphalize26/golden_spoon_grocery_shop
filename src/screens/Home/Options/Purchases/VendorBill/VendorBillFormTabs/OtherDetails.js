import React from 'react';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { CheckBox } from '@components/common/CheckBox';

const OtherDetails = ({ onFieldChange }) => {

  return (
    <RoundedScrollContainer>
      <FormInput
        label={"Reference"}
        placeholder={"Enter Reference"}
        editable={true}
        onChangeText={(value) => onFieldChange('reference', value)}
      />
      <CheckBox
        label="From Website Pickup"
        // checked={formData.isActive}
        // onPress={() => onFieldChange('isActive', !formData.isActive)}
      />
    </RoundedScrollContainer>
  )
}

export default OtherDetails;