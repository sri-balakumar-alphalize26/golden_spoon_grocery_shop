import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import { Button } from '@components/common/Button';
import { FONT_FAMILY } from '@constants/theme';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import format from 'date-fns/format';
import { CheckBox } from '@components/common/CheckBox';
import { NavigationHeader } from '@components/Header';
import { TextInput } from '@components/common/TextInput';

const MeetingsScheduleModal = ({ isVisible, onClose, onSave, title, placeholder }) => {

    const [formState, setFormState] = useState({
        meeting: '',
        meetingDateAndTime: new Date(),
        isDateTimePickerVisible: false,
        isReminder: false,
        reminderMinutes: 0,
        errorText: ''
    });

    const handleInputChange = (name, value) => {
        setFormState(prevState => ({ ...prevState, [name]: value }));
    };

    const handleSave = () => {
        const { meeting, meetingDateAndTime, isReminder, reminderMinutes } = formState;
        let hasError = false;

        if (!meeting) {
            handleInputChange('errorText', 'Meeting title is required');
            hasError = true;
        }

        if (!meetingDateAndTime) {
            handleInputChange('errorText', 'Start time is required');
            hasError = true;
        }

        if (!hasError) {
            onSave({
                title: meeting,
                start: meetingDateAndTime,
                is_Remainder: isReminder,
                minutes: isReminder ? reminderMinutes : 0,
            });
            resetForm();
            onClose();
        }
    };

    const resetForm = () => {
        setFormState({
            meeting: '',
            meetingDateAndTime: new Date(),
            meetingTime: new Date(),
            isDateTimePickerVisible: false,
            isTimePickerVisible: false,
            isReminder: false,
            reminderMinutes: 0,
            errorText: ''
        });
    };

    const { meeting, meetingDateAndTime, isDateTimePickerVisible, isReminder, reminderMinutes, errorText } = formState;

    return (
        <Modal
            isVisible={isVisible}
            animationIn="bounceIn"
            animationOut="slideOutDown"
            backdropOpacity={0.7}
            animationInTiming={400}
            animationOutTiming={300}
            backdropTransitionInTiming={400}
            backdropTransitionOutTiming={300}
        >
            <View style={styles.modalContainer}>
                <NavigationHeader onBackPress={onClose} title={title} />
                <View style={styles.modalContent}>
                    <TextInput
                        column={false}
                        required
                        label={'Meeting Title'}
                        placeholder={'Enter meeting title'}
                        dropIcon='pen'
                        value={meeting}
                        onChangeText={(text) => handleInputChange('meeting', text)}
                        validate={errorText}
                    />
                    <View style={{ height: 5 }} />
                    <TextInput
                        column={false}
                        required
                        label={'Schedule Meeting'}
                        placeholder={'Enter Date & Time'}
                        dropIcon='calendar'
                        value={meetingDateAndTime ? format(meetingDateAndTime, "dd-MM-yyyy HH:mm:ss") : 'Select Date'}
                        editable={false}
                        onPress={() => handleInputChange('isDateTimePickerVisible', true)}
                    />
                    <CheckBox checked={isReminder} onPress={(value) => handleInputChange('isReminder', value)} label={'Set Reminder'} />
                    {isReminder && (
                        <TextInput
                            column={false}
                            label={'Set Reminder'}
                            placeholder={reminderMinutes === 0 ? 'Enter reminder minutes' : ''}
                            value={reminderMinutes === 0 ? '' : reminderMinutes.toString()}
                            onChangeText={(text) => handleInputChange('reminderMinutes', parseInt(text) || 0)}
                            keyboardType="numeric"
                        />
                    )}
                    <View style={styles.buttonRow}>
                        <View style={{ flex: 2 }}>
                            <Button title="CANCEL" onPress={onClose} />
                        </View>
                        <View style={{ width: 10 }} />
                        <View style={{ flex: 2 }}>
                            <Button title="SAVE" onPress={handleSave} />
                        </View>
                    </View>
                </View>
            </View>
            <DateTimePickerModal
                isVisible={isDateTimePickerVisible}
                mode="datetime"
                date={meetingDateAndTime}
                onConfirm={(date) => {
                    handleInputChange('meetingDateAndTime', date);
                    handleInputChange('isDateTimePickerVisible', false);
                }}
                onCancel={() => handleInputChange('isDateTimePickerVisible', false)}
            />
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: 'white',
        padding: 20,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 10,
        width: '100%',
    },
    textInput: {
        borderWidth: 1,
        borderColor: 'gray',
        marginBottom: 10,
        padding: 10,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
        borderRadius: 5,
    },
    buttonRow: {
        flexDirection: 'row',
    },
});

export default MeetingsScheduleModal;
