import React, { useState } from 'react';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { formatDateTime } from '@utils/common/date';
import { Button } from '@components/common/Button';

const InAndOut = ({ formData, errors, handleFieldChange, submit, loading }) => {
    const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
    const [selectedField, setSelectedField] = useState(null);

    const toggleDatePicker = (field) => {
        setSelectedField(field);
        setDatePickerVisibility(true);
    };

    const handleDateConfirm = (date) => {
        handleFieldChange(selectedField, date);
        setDatePickerVisibility(false);
    };

    return (
        <RoundedScrollContainer>
            <FormInput
                label="Time In"
                dropIcon="calendar"
                required
                editable={false}
                onPress={() => toggleDatePicker('timeIn')}
                value={formatDateTime(formData.timeIn, 'dd-MM-yyyy HH:mm:ss') || 'DD-MM-YYYY HH:mm'}
                validate={errors.timeIn}
            />
            <FormInput
                label="Time Out"
                dropIcon="calendar"
                required
                editable={false}
                onPress={() => toggleDatePicker('timeOut')}
                validate={errors.timeOut}
                value={formatDateTime(formData.timeOut, 'dd-MM-yyyy HH:mm:ss') || 'DD-MM-YYYY HH:mm'}
            />

            <DateTimePickerModal
                isVisible={isDatePickerVisible}
                mode="datetime"
                onConfirm={handleDateConfirm}
                onCancel={() => setDatePickerVisibility(false)}
            />
            {/* Button to submit */}
            <Button alignSelf={'center'} width={'50%'} height={40} title={'SUBMIT'} onPress={submit} loading={loading} />
        </RoundedScrollContainer>
    );
};

export default InAndOut;
