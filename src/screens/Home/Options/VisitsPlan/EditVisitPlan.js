import { Keyboard } from 'react-native';
import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { TextInput as FormInput } from '@components/common/TextInput';
import { fetchCustomersDropdown, fetchEmployeesDropdown, fetchPurposeofVisitDropdown } from '@api/dropdowns/dropdownApi';
import { DropdownSheet } from '@components/common/BottomSheets';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { formatDate } from '@utils/common/date';
import { useAuthStore } from '@stores/auth';
import { validateFields } from '@utils/validation';
import { put } from '@api/services/utils';
import { showToast } from '@utils/common';
import { useFocusEffect } from '@react-navigation/native';
import { fetchVisitPlanDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';

const EditVisitPlan = ({ navigation, route }) => {

    const { visitPlanId } = route?.params || {}
    const currentUser = useAuthStore(state => state.user)
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isVisible, setIsVisible] = useState(false);
    const [selectedType, setSelectedType] = useState(null);
    const [isTimePickerVisible, setIsTimePickerVisible] = useState(false);
    const [isDateTimePickerVisible, setIsDateTimePickerVisible] = useState(false);
    const [errors, setErrors] = useState({});
    const [formData, setFormData] = useState({})

    const fetchDetails = async (visitPlanId) => {
        setIsLoading(true);
        try {
            const [detail] = await fetchVisitPlanDetails(visitPlanId);
            setFormData((prevFormData) => ({
                ...prevFormData,
                customer: { id: detail?.customer_id || '', label: detail?.customer_name?.trim() || '' },
                selectDuration: '',
                assignedTo: { id: detail?.visit_employee_id || '', label: detail?.visit_employee_name || '' },
                dateAndTime: detail?.visit_date || null,
                visitPurpose: { id: detail?.purpose_of_visit_id || '', label: detail?.purpose_of_visit_name },
                remarks: detail?.remarks,
            }));
        } catch (error) {
            console.error('Error fetching visit plan details:', error);
            showToast({ type: 'error', title: 'Error', message: 'Failed to fetch visit plan details. Please try again.' });
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (visitPlanId) {
                fetchDetails(visitPlanId);
            }
        }, [visitPlanId])

    );

    const [dropdown, setDropdown] = useState({
        customer: [],
        assignedTo: [],
        brand: [],
        selectDuration: [
            { id: 'tomorrow', label: 'Tomorrow' },
            { id: 'custom', label: 'Custom Date' }
        ],
        visitPurpose: [],
        remarks: [],
    });

    const handleFieldChange = (field, value) => {
        setFormData((prevFormData) => ({
            ...prevFormData,
            [field]: value,
        }));
        if (errors[field]) {
            setErrors((prevErrors) => ({
                ...prevErrors,
                [field]: null,
            }));
        }
    };

    useEffect(() => {
        const fetchDropdownData = async () => {
            try {
                const customerDropdown = await fetchCustomersDropdown();
                const assignedToDropdown = await fetchEmployeesDropdown();
                const visitPurposeDropdown = await fetchPurposeofVisitDropdown();
                setDropdown((prevDropdown) => ({
                    ...prevDropdown,
                    customer: customerDropdown.map((data) => ({ id: data._id, label: data.name?.trim() })),
                    assignedTo: assignedToDropdown.map((data) => ({ id: data._id, label: data.name })),
                    visitPurpose: visitPurposeDropdown.map((data) => ({ id: data._id, label: data.name }))
                }));
            } catch (error) {
                console.error('Error fetching dropdown data:', error);
            }
        };

        fetchDropdownData();
    }, []);

    useEffect(() => {
        if (formData.selectDuration?.id === 'tomorrow') {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            handleFieldChange('dateAndTime', tomorrow);
            setIsTimePickerVisible(true);
        } else if (formData.selectDuration?.id === 'custom') {
            setIsDateTimePickerVisible(true);
        }
    }, [formData.selectDuration]);

    const handleTimeChange = (time) => {
        if (time) {
            const selectedDate = formData.dateAndTime ? new Date(formData.dateAndTime) : new Date();
            selectedDate.setHours(time.getHours());
            selectedDate.setMinutes(time.getMinutes());
            handleFieldChange('dateAndTime', selectedDate);
        }
        setIsTimePickerVisible(false);
    };

    const handleDateChange = (date) => {
        if (date) {
            handleFieldChange('dateAndTime', date);
        }
        setIsDateTimePickerVisible(false);
    };

    const toggleBottomSheet = (type) => {
        setSelectedType(type);
        setIsVisible(!isVisible);
    };

    const renderBottomSheet = () => {
        let items = [];
        let fieldName = '';

        switch (selectedType) {
            case 'Customers':
                items = dropdown.customer;
                fieldName = 'customer';
                break;
            case 'Employees':
                items = dropdown.assignedTo;
                fieldName = 'assignedTo';
                break;
            case 'Select Duration':
                items = dropdown.selectDuration;
                fieldName = 'selectDuration';
                break;
            case 'Visit Purpose':
                items = dropdown.visitPurpose;
                fieldName = 'visitPurpose';
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
                onValueChange={(value) => handleFieldChange(fieldName, value)}
            />
        );
    };

    const validateForm = (fieldsToValidate) => {
        Keyboard.dismiss();
        const { isValid, errors } = validateFields(formData, fieldsToValidate);
        setErrors(errors);
        return isValid;
    };

    const handleSubmit = async () => {
        const fieldsToValidate = ['customer', 'dateAndTime', 'visitPurpose', 'remarks'];
        if (validateForm(fieldsToValidate)) {
            setIsSubmitting(true);
            const updateVisitPlanData = {
                visit_plan_id: visitPlanId,
                visit_date: formData.dateAndTime,
                customer_id: formData.customer?.id,
                purpose_of_visit_id: formData.visitPurpose?.id,
                sales_person_id: currentUser?.related_profile?._id || '',
                remarks: formData.remarks,
                approval_status: 'Approved',
                visit_employee_id: formData?.assignedTo?.id
            };
            try {
                const response = await put("/updateVisitPlan", updateVisitPlanData);
                if (response.success) {
                    showToast({ type: "success", title: "Success", message: response.message || "Visit Plan updated successfully" });
                    navigation.goBack();
                } else {
                    showToast({ type: "error", title: "Error", message: response.message || "Update Visit Plan failed" });
                }
            } catch (error) {
                showToast({ type: "error", title: "Error", message: "An unexpected error occurred. Please try again later." });
            } finally {
                setIsSubmitting(false);
            }
            setIsSubmitting(false);
        }
    };

    return (
        <SafeAreaView>
            <NavigationHeader
                title="Edit Visit Plan"
                onBackPress={() => navigation.goBack()}
            />
            <RoundedScrollContainer>
                <FormInput
                    label={"Customer Name"}
                    placeholder={"Select Customer"}
                    value={formData?.customer?.label}
                    dropIcon={"menu-down"}
                    editable={false}
                    multiline
                    validate={errors.customer}
                    onPress={() => toggleBottomSheet('Customers')}
                />
                <FormInput
                    label={"Assigned To"}
                    placeholder={"Select Assignee"}
                    dropIcon={"menu-down"}
                    value={formData?.assignedTo?.label}
                    editable={false}
                    onPress={() => toggleBottomSheet('Employees')}
                />
                <FormInput
                    label={"Date & Time"}
                    placeholder={"Select visit time"}
                    dropIcon={"menu-down"}
                    editable={false}
                    value={formData.dateAndTime ? formatDate(formData.dateAndTime, 'dd-MM-yyyy HH:mm:ss') : "Select visit time"}
                    validate={errors.dateAndTime}
                    onPress={() => toggleBottomSheet('Select Duration')}
                />
                <FormInput
                    label={"Visit Purpose"}
                    placeholder={"Select purpose of visit"}
                    dropIcon={"menu-down"}
                    editable={false}
                    value={formData?.visitPurpose?.label}
                    validate={errors.visitPurpose}
                    onPress={() => toggleBottomSheet('Visit Purpose')}
                />
                <FormInput
                    label={"Remarks"}
                    placeholder={"Enter remarks"}
                    multiline={true}
                    numberOfLines={5}
                    validate={errors.remarks}
                    value={formData?.remarks}
                    textAlignVertical={'top'}
                    onChangeText={(value) => handleFieldChange('remarks', value)}
                />
                {renderBottomSheet()}
                <LoadingButton
                    loading={isSubmitting}
                    title={'SAVE'}
                    onPress={handleSubmit}
                />
                <DateTimePickerModal
                    isVisible={isTimePickerVisible}
                    mode='time'
                    display="default"
                    accentColor='green'
                    onConfirm={handleTimeChange}
                    onCancel={() => setIsTimePickerVisible(false)}
                />
                <DateTimePickerModal
                    isVisible={isDateTimePickerVisible}
                    mode='datetime'
                    display="default"
                    accentColor='green'
                    onConfirm={handleDateChange}
                    onCancel={() => setIsDateTimePickerVisible(false)}
                />
                <OverlayLoader visible={isLoading} />
            </RoundedScrollContainer>
        </SafeAreaView>
    );
};

export default EditVisitPlan;
