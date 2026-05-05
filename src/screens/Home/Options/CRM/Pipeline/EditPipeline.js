import React, { useState, useEffect, useCallback } from 'react';
import { Keyboard } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { showToast } from '@utils/common';
import { put } from '@api/services/utils';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import {
    fetchSourceDropdown,
    fetchSalesPersonDropdown,
    fetchCustomersDropdown,
    fetchOpportunityDropdown,
    fetchEnquiryTypeDropdown
} from '@api/dropdowns/dropdownApi';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { formatDateTime } from '@utils/common/date';
import { validateFields } from '@utils/validation';
import { fetchPipelineDetails } from '@api/details/detailApi';
import { useFocusEffect } from '@react-navigation/native';
import OverlayLoader from '@components/Loader/OverlayLoader';

const EditPipeline = ({ navigation, route }) => {

    const { pipelineId } = route?.params || {};
    const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedDropdownType, setSelectedDropdownType] = useState(null);
    const [isDropdownSheetVisible, setIsDropdownSheetVisible] = useState(false);
    const [formData, setFormData] = useState({});

    const [errors, setErrors] = useState({});
    const [dropdowns, setDropdowns] = useState({
        source: [],
        enquiryType: [],
        salesPerson: [],
        customer: [],
        opportunity: [],
    });

    const fetchDetails = async (pipelineId) => {
        setIsLoading(true);
        try {
            const [detail] = await fetchPipelineDetails(pipelineId);
            setFormData(prevFormData => ({
                ...prevFormData,
                dateTime: detail?.date || new Date(),
                source: { id: detail?.source?.source_id || '', label: detail?.source?.source_name || '' },
                enquiryType: { id: detail?.enquiry?.enquiry_id || '', label: detail?.enquiry?.enquiry_name || '' },
                salesPerson: { id: detail?.employee?.employee_id || '', label: detail?.employee?.employee_name || '' },
                opportunity: { id: detail?.oppertunity?.oppertunity_id || '', label: detail?.oppertunity?.oppertunity_name || '' },
                customer: { id: detail?.customer?._id || '', label: detail?.customer?.name || '' },
                remarks: detail?.remarks || '',
                status: detail?.status || ''
            }));
        } catch (error) {
            console.error('Error fetching enquiry details:', error);
            showToast({ type: 'error', title: 'Error', message: 'Failed to fetch enquiry details. Please try again.' });
        } finally {
            setIsLoading(false);
        }
    };


    useFocusEffect(
        useCallback(() => {
            if (pipelineId) {
                fetchDetails(pipelineId);
            }
        }, [pipelineId])
    );

    useEffect(() => {
        const fetchDropdownData = async () => {
            try {
                const [sourceData, enquiryTypeData, salesPersonData, customerData, opportunityData] = await Promise.all([
                    fetchSourceDropdown(),
                    fetchEnquiryTypeDropdown(),
                    fetchSalesPersonDropdown(),
                    fetchCustomersDropdown(),
                    fetchOpportunityDropdown(),
                ]);
                setDropdowns({
                    source: sourceData.map(data => ({
                        id: data._id,
                        label: data.source_name,
                    })),
                    enquiryType: enquiryTypeData.map(data => ({
                        id: data._id,
                        label: data.type_name,
                    })),
                    salesPerson: salesPersonData.map(data => ({
                        id: data._id,
                        label: data.name,
                    })),
                    customer: customerData.map(data => ({
                        id: data._id,
                        label: data.name,
                    })),
                    opportunity: opportunityData.map(data => ({
                        id: data._id,
                        label: data.oppertunity_name,
                    })),
                });
            } catch (error) {
                console.error('Error fetching dropdown data:', error);
            }
        };

        fetchDropdownData();
    }, []);

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

    const toggleBottomSheet = (type) => {
        setSelectedDropdownType(type);
        setIsDropdownSheetVisible(!isDropdownSheetVisible);
    };

    const renderBottomSheet = () => {
        let items = [];
        let fieldName = '';

        switch (selectedDropdownType) {
            case 'Source':
                items = dropdowns.source;
                fieldName = 'source';
                break;
            case 'Enquiry Type':
                items = dropdowns.enquiryType;
                fieldName = 'enquiryType';
                break;
            case 'Sales Person':
                items = dropdowns.salesPerson;
                fieldName = 'salesPerson';
                break;
            case 'Customer':
                items = dropdowns.customer;
                fieldName = 'customer';
                break;
            case 'Opportunity':
                items = dropdowns.opportunity;
                fieldName = 'opportunity';
                break;
            default:
                return null;
        }
        return (
            <DropdownSheet
                isVisible={isDropdownSheetVisible}
                items={items}
                title={selectedDropdownType}
                onClose={() => setIsDropdownSheetVisible(false)}
                onValueChange={(value) => handleFieldChange(fieldName, value)}
            />
        );
    };

    const handleDateConfirm = (date) => {
        handleFieldChange('dateTime', date);
        setIsDatePickerVisible(false);
    };


    const validateForm = (fieldsToValidate) => {
        Keyboard.dismiss();
        const { isValid, errors } = validateFields(formData, fieldsToValidate);
        setErrors(errors);
        return isValid;
    };

    const handleSubmit = async () => {
        const fieldsToValidate = ['source', 'enquiryType', 'salesPerson', 'opportunity', 'customer'];
        if (validateForm(fieldsToValidate)) {
            setIsSubmitting(true);
            const PipelineData = {
                pipeline_id: pipelineId,
                date: formData?.dateTime,
                status: formData.status,
                source_id: formData?.source?.id || null,
                enquiry_type_id: formData?.enquiryType?.id || null,
                sales_person_id: formData?.salesPerson?.id || null,
                oppertunity_type_id: formData?.opportunity?.id || null,
                customer_id: formData?.customer?.id || null,
                remarks: formData?.remarks || null,
            };
            try {
                const response = await put("/updatePipeline", PipelineData);
                if (response.message === 'Succesfully updated pipeline list') {
                    showToast({
                        type: "success",
                        title: "Success",
                        message: response.message || "Pipeline updated successfully",
                    });
                    navigation.goBack();
                } else {
                    showToast({
                        type: "error",
                        title: "ERROR",
                        message: response.message || "Pipeline updation failed",
                    });
                }
            } catch (error) {
                showToast({
                    type: "error",
                    title: "ERROR",
                    message: "An unexpected error occurred. Please try again later.",
                });
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    return (
        <SafeAreaView>
            <NavigationHeader
                title="Edit Pipeline"
                onBackPress={() => navigation.goBack()}
            />
            <RoundedScrollContainer>
                <FormInput
                    label="Date Time"
                    dropIcon="calendar"
                    editable={false}
                    value={formatDateTime(formData.dateTime)}
                    onPress={() => setIsDatePickerVisible(true)}
                />
                <FormInput
                    label="Source"
                    placeholder="Select Source"
                    dropIcon="menu-down"
                    editable={false}
                    required
                    validate={errors.source}
                    value={formData.source?.label}
                    onPress={() => toggleBottomSheet('Source')}
                />
                <FormInput
                    label="Enquiry Type"
                    placeholder="Enter Enquiry Type"
                    dropIcon="menu-down"
                    editable={false}
                    required
                    validate={errors.enquiryType}
                    value={formData.enquiryType?.label}
                    onPress={() => toggleBottomSheet('Enquiry Type')}
                />
                <FormInput
                    label="Sales Person"
                    placeholder="Select Sales person"
                    dropIcon="menu-down"
                    editable={false}
                    required
                    validate={errors.salesPerson}
                    value={formData.salesPerson?.label}
                    onPress={() => toggleBottomSheet('Sales Person')}
                />
                <FormInput
                    label="Opportunity"
                    placeholder="Enter Opportunity"
                    dropIcon="menu-down"
                    editable={false}
                    required
                    validate={errors.opportunity}
                    value={formData.opportunity?.label}
                    onPress={() => toggleBottomSheet('Opportunity')}
                />
                <FormInput
                    label="Customer"
                    placeholder="Select Customer"
                    dropIcon="menu-down"
                    editable={false}
                    required
                    multiline={true}
                    validate={errors.customer}
                    value={formData.customer?.label?.trim()}
                    onPress={() => toggleBottomSheet('Customer')}
                />
                <FormInput
                    label="Remarks"
                    placeholder="Enter Remarks"
                    editable={true}
                    multiline={true}
                    numberOfLines={5}
                    textAlignVertical="top"
                    marginTop={10}
                    value={formData.remarks}
                    onChangeText={(value) => handleFieldChange('remarks', value)}
                />
                {renderBottomSheet()}
                <LoadingButton title="SAVE" onPress={handleSubmit} loading={isSubmitting} marginTop={10} />
                <DateTimePickerModal
                    isDropdownSheetVisible={isDatePickerVisible}
                    mode="date"
                    onConfirm={handleDateConfirm}
                    onCancel={() => setIsDatePickerVisible(false)}
                />
            </RoundedScrollContainer>
            <OverlayLoader visible={isLoading} />
        </SafeAreaView>

    );
};

export default EditPipeline;
