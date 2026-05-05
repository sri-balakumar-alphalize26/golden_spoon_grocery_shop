import React, { useState, useEffect } from 'react'
import { formatDate } from '@utils/common/date'
import { RoundedScrollContainer } from '@components/containers'
import { DropdownSheet } from '@components/common/BottomSheets'
import { fetchCustomersDropdown, fetchPurposeofVisitDropdown, fetchSiteLocationDropdown } from '@api/dropdowns/dropdownApi'
import { fetchCustomerDetails } from '@api/details/detailApi'
import { TextInput as FormInput } from '@components/common/TextInput'
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { showToastMessage } from '@components/Toast'
import { Button } from '@components/common/Button'


const Customer = ({ formData, errors, handleFieldChange, onNextPress }) => {

    const [isVisible, setIsVisible] = useState(false);
    const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
    const [selectedType, setSelectedType] = useState(null);
    const [dropdowns, setDropdowns] = useState({ customers: [], siteLocation: [], visitPurpose: [], contactPerson: [] })
    const [isCustomerSelected, setIsCustomerSelected] = useState(false);
    // customer is selected only other dropdowns is work
    useEffect(() => {
        setIsCustomerSelected(!!formData.customer);
    }, [formData.customer]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const customersDropdown = await fetchCustomersDropdown();
                const visitPurposeDropdown = await fetchPurposeofVisitDropdown();
                setDropdowns(prevDropdown => ({
                    ...prevDropdown,
                    customers: customersDropdown.map((data) => ({
                        id: data._id,
                        label: data.name?.trim(),
                    })),
                    visitPurpose: visitPurposeDropdown.map((data) => ({
                        id: data._id,
                        label: data.name,
                    })),
                }));
            } catch (error) {
                console.error("Error fetching dropdown data:", error);
            }
        };

        fetchData();
    }, []);

    useEffect(() => {
        if (formData.customer) {
            const fetchSiteLocationData = async () => {
                try {
                    const siteLocationDropdown = await fetchSiteLocationDropdown(formData.customer.id);
                    setDropdowns(prevDropdown => ({
                        ...prevDropdown,
                        siteLocation: siteLocationDropdown.map(data => ({
                            id: data._id,
                            label: data.site_location_name,
                        })),
                    }));
                } catch (error) {
                    console.error('Error fetching site dropdown data:', error);
                }
            };

            fetchSiteLocationData();
        }
    }, [formData.customer]);

    useEffect(() => {
        if (formData.customer) {
            const fetchContactDetails = async () => {
                try {
                    const contactDetailsDropdown = await fetchCustomerDetails(formData.customer.id);
                    setDropdowns(prevDropdown => ({
                        ...prevDropdown,
                        contactPerson: contactDetailsDropdown?.[0]?.customer_contact?.map(data => ({
                            id: data._id,
                            label: data.contact_name,
                            contactNo: data.contact_number.toString()
                        })),
                    }));
                } catch (error) {
                    console.error('Error fetching contacts dropdown data:', error);
                }
            };

            fetchContactDetails();
        }
    }, [formData.customer]);


    const toggleBottomSheet = (type) => {
        setSelectedType(type);
        setIsVisible(!isVisible);
    };

    const renderBottomSheet = () => {
        let items = [];
        let fieldName = '';

        switch (selectedType) {
            case 'Customers':
                items = dropdowns.customers;
                fieldName = 'customer';
                break;
            case 'Visit Purpose':
                items = dropdowns.visitPurpose;
                fieldName = 'visitPurpose';
                break;
            case 'Site Location':
                items = dropdowns.siteLocation;
                fieldName = 'siteLocation';
                break;
            case 'Contact Person':
                items = dropdowns.contactPerson;
                fieldName = 'contactPerson';
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
    return (
        <RoundedScrollContainer>
            <FormInput
                required
                label={"Date & Time"}
                dropIcon={"calendar"}
                editable={false}
                value={formatDate(formData.dateAndTime, 'dd-MM-yyyy hh:mm:ss')}
            />
            <FormInput
                label={"Employee Name"}
                placeholder={"Select Employee"}
                editable={false}
                multiline={true}
                required
                value={formData.employee?.label}
                validate={errors.employee}
            />
            <FormInput
                label={"Customer Name"}
                placeholder={"Select Customer"}
                dropIcon={"menu-down"}
                editable={false}
                multiline={true}
                required
                value={formData.customer?.label}
                validate={errors.customer}
                onPress={() => toggleBottomSheet('Customers')}
            />
            <FormInput
                label={"Next Visit Date"}
                dropIcon={"calendar"}
                editable={false}
                onPress={() => setIsDatePickerVisible(!isDatePickerVisible)}
                value={formatDate(formData.nextVisitDate, 'dd-MM-yyyy hh:mm:ss') || 'DD-MM-YYYY hh:mm'}
            />
            <FormInput
                label={"Site/Location"}
                placeholder={"Select Site / Location"}
                dropIcon={"menu-down"}
                editable={false}
                value={formData.siteLocation?.label}
                validate={errors.siteLocation}
                onPress={() => isCustomerSelected ? toggleBottomSheet('Site Location') : showToastMessage('Select Customer !')}
            />
            <FormInput
                label={"Contact Person"}
                placeholder={"Contact person"}
                dropIcon={"menu-down"}
                validate={errors.cotactPerson}
                value={formData.contactPerson?.label}
                editable={false}
                onPress={() => isCustomerSelected ? toggleBottomSheet('Contact Person') : showToastMessage('Select Customer !')}
            />
            <FormInput
                label={"Cotact No"}
                placeholder={"Contact person"}
                dropIcon={"menu-down"}
                editable={false}
                value={formData.contactPerson?.contactNo}
                onPress={() => isCustomerSelected ? null : showToastMessage('Select Customer !')}

            />
            <FormInput
                label={"Visit Purpose"}
                placeholder={"Select purpose of visit"}
                dropIcon={"menu-down"}
                editable={false}
                required
                value={formData.visitPurpose?.label}
                validate={errors.visitPurpose}
                onPress={() => toggleBottomSheet('Visit Purpose')}
            />
            {renderBottomSheet()}
            <DateTimePickerModal
                isVisible={isDatePickerVisible}
                mode="datetime"
                onConfirm={(value) => handleFieldChange('nextVisitDate', value)}
                onCancel={() => setIsDatePickerVisible(false)}
            />
            {/* Button to next tab */}
            <Button alignSelf={'center'} width={'50%'} height={40} title={'NEXT'} onPress={onNextPress} />
        </RoundedScrollContainer>
    )
}

export default Customer