import React from 'react'
import { RoundedScrollContainer, UploadsContainer } from '@components/containers'
import { TextInput as FormInput } from '@components/common/TextInput'
import { ActionModal } from '@components/Modal'
import { Button } from '@components/common/Button'


const VisitDetails = ({ formData, errors, handleFieldChange, onNextPress }) => {

  const handleDeleteImage = (index) => {
    const updatedImages = [...formData.imageUrls];
    updatedImages.splice(index, 1);
    handleFieldChange('imageUrls', updatedImages);
  };
  return (
    <RoundedScrollContainer>
      <FormInput
        label={"Remarks"}
        placeholder={"Enter Remarks"}
        multiline={true}
        textAlignVertical='top'
        numberOfLines={5}
        required
        value={formData.remarks}
        validate={errors.remarks}
        onChangeText={(value) => handleFieldChange('remarks', value)}
      />

      {/* Options Modal Camera or Gallery */}
      <ActionModal
        title="Attach file"
        setImageUrl={(url) => handleFieldChange('imageUrls', [...formData.imageUrls, url])}
      />
      {formData.imageUrls?.length > 0 && (
        <UploadsContainer imageUrls={formData.imageUrls} onDelete={handleDeleteImage} />
      )}
      {/* Button to next tab */}
      <Button alignSelf={'center'} width={'50%'} height={40} title={'NEXT'} onPress={onNextPress} />
    </RoundedScrollContainer>
  )
}

export default VisitDetails
