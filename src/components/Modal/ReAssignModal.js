import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import { Button } from '@components/common/Button';
import { FONT_FAMILY } from '@constants/theme';
import { NavigationHeader } from '@components/Header';
import { TextInput } from '@components/common/TextInput';
import { fetchAssigneeDropdown } from '@api/dropdowns/dropdownApi';
import CustomListModal from './CustomListModal';

const ReAssignModal = ({ isVisible, onClose, onSubmit, header = '' }) => {
    const [formState, setFormState] = useState({
        assignee: '',
        estimatedTime: '',
        reason: '',
    });

    const [selectedType, setSelectedType] = useState(null);
    const [isDropdownVisible, setIsDropdownVisible] = useState(false);
    const [dropdown, setDropdown] = useState({
        assignee: [],
    });

    useEffect(() => {
        const fetchDropdownData = async () => {
            try {
                const assigneeData = await fetchAssigneeDropdown();
                setDropdown((prevDropdown) => ({
                    ...prevDropdown,
                    assignee: assigneeData.map((data) => ({
                        id: data._id,
                        label: data.name,
                    })),
                }));
            } catch (error) {
                console.error('Error fetching assignee dropdown data:', error);
            }
        };

        fetchDropdownData();
    }, []);

    const handleFieldChange = (name, value) => {
        setFormState((prevState) => ({
            ...prevState,
            [name]: value,
        }));
    };

    const handleSave = () => {
        const { assignee, estimatedTime, reason } = formState;
        let hasError = false;

        if (!assignee) {
            setFormState(prevState => ({ ...prevState, errorText: 'Assignee is required' }));
            hasError = true;
        } else if (!estimatedTime) {
            setFormState(prevState => ({ ...prevState, errorText: 'Estimated time is required' }));
            hasError = true;
        } else if (!reason) {
            setFormState(prevState => ({ ...prevState, errorText: 'Reason is required' }));
            hasError = true;
        }

        if (!hasError) {
            onSubmit({
                selectedAssignee: assignee,
                estimatedTime,
                reason
            });
            resetForm();
            onClose();
        }
    };

    const resetForm = () => {
        setFormState({
            assignee: '',
            estimatedTime: '',
            reason: '',
        });
    };

    const { assignee, estimatedTime, reason, errorText } = formState;

    const toggleBottomSheet = (type) => {
        setSelectedType(type);
        setIsDropdownVisible(!isDropdownVisible);
    };

    const renderBottomSheet = () => {
        let items = [];
        let fieldName = '';

        switch (selectedType) {
            case 'Assignee':
                items = dropdown.assignee;
                fieldName = 'assignee';
                break;
            default:
                return null;
        }
        return (
            <CustomListModal
                isVisible={isDropdownVisible}
                items={items}
                title={selectedType}
                onClose={() => setIsDropdownVisible(false)}
                onValueChange={(value) => handleFieldChange(fieldName, value)}
                onAddIcon={false}
            />
        );
    };

    return (
        <Modal
            isVisible={isVisible}
            animationIn="slideInDown"
            animationOut="slideOutDown"
            backdropOpacity={0.7}
            animationInTiming={400}
            animationOutTiming={300}
            backdropTransitionInTiming={400}
            backdropTransitionOutTiming={300}
        >
            <View style={styles.modalContainer}>
                <NavigationHeader onBackPress={onClose} title={header} />
                <View style={styles.modalContent}>
                    <TextInput
                        label={'Assignee :'}
                        placeholder="Enter Assignee"
                        dropIcon={"menu-down"}
                        value={assignee?.label}
                        editable={false}
                        required
                        column={false}
                        onPress={() => toggleBottomSheet('Assignee')}
                        validate={errorText}
                        multiline
                        numberOfLines={2}
                    />
                    <View style={{ height: 5 }} />
                    <TextInput
                        column={false}
                        required
                        label={'Estimated Time(HR) :'}
                        value={estimatedTime}
                        onChangeText={(text) => handleFieldChange('estimatedTime', text)}
                        keyboardType="numeric"
                        validate={errorText}
                    />
                    <View style={{ height: 5 }} />
                    <TextInput
                        column={false}
                        required
                        label={'Reason :'}
                        value={reason}
                        multiline={true}
                        onChangeText={(text) => handleFieldChange('reason', text)}
                        validate={errorText}
                    />
                    <View style={styles.buttonRow}>
                        <Button title="Assign" onPress={handleSave} />
                    </View>
                </View>
            </View>
            {renderBottomSheet()}
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
        borderBottomRightRadius: 10,
        borderBottomLeftRadius: 10,
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
        marginTop: 10,
    },
});

export default ReAssignModal;