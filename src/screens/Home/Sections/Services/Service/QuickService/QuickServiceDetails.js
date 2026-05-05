import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View } from 'react-native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { RoundedScrollContainer } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { formatDate } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchServiceDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';
import { Button } from '@components/common/Button';
import { COLORS } from '@constants/theme';
import { post, put } from '@api/services/utils';
import { CloseModal } from '@components/Modal';

const QuickServiceDetails = ({ navigation, route }) => {
    const { id: serviceId } = route?.params || {};
    const [details, setDetails] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCloseModalVisible, setIsCloseModalVisible] = useState(false);
    const [actionToPerform, setActionToPerform] = useState(null);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchServiceDetails(serviceId);
            setDetails(updatedDetails[0] || {});
        } catch (error) {
            console.error('Error fetching service details:', error);
            showToastMessage('Failed to fetch service details. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (serviceId) {
                fetchDetails(serviceId);
            }
        }, [serviceId])
    );

    const handleCloseJob = async (updateText) => {
        setIsSubmitting(true);
        try {
            const closeJobData = {
                _id: details._id,
                job_stage: "Closed",
                job_stage_close_reason: updateText,
            };
            console.log("Closing Reason", closeJobData)
            const response = await put('/updateJobRegistration', closeJobData);
            if (response.success === "true") {
                showToastMessage('Job successfully closed!');
                navigation.navigate('QuickServiceScreen');
            } else {
                showToastMessage('Failed to close job. Please try again.');
            }
        } catch (error) {
            showToastMessage('An error occurred. Please try again.');
        } finally {
            fetchDetails();
            setIsSubmitting(false);
        }
    };

    const handleUpdateJob = () => {
        navigation.navigate('QuickServiceUpdateDetails', { id: serviceId });
    };

    const accessoriesString = details?.accessories?.map(acc => acc.accessory_name).join(', ') || '-';

    const complaintsString = Array.isArray(details?.service_register_complaint_lists) 
    ? details.service_register_complaint_lists.map(complaint => complaint.master_problem_name || 'No Complaint Name').join(', ') : '-';

    const subComplaintsString = Array.isArray(details?.service_register_complaint_lists?.[0]?.sub_problems_ids) 
    ? details.service_register_complaint_lists[0].sub_problems_ids.map(subComplaint => subComplaint.sub_problem_name || 'No Sub Complaint Name').join(', ') : '-';

    const isJobClosedOrCompleted = details.job_stage === "Closed" || details.job_stage === "Completed";

    return (
        <SafeAreaView>
            <NavigationHeader
                title={details?.sequence_no || 'Quick Service Details'}
                onBackPress={() => navigation.goBack()}
                logo={false}
                iconOneName="close"
                iconOnePress={() => {
                    setActionToPerform('close');
                    setIsCloseModalVisible(true);
                }}
                disabled={isJobClosedOrCompleted}
            />
            <RoundedScrollContainer>
                <DetailField label="Job Stage" value={details?.job_stage || '-'} />
                <DetailField label="Close Reason" value={details?.job_stage_close_reason || '-'} />
                <DetailField label="Customer"
                    value={details?.customer_name ? details.customer_name.trim() : '-'}
                    multiline={true}
                    textAlignVertical={'top'} />
                <DetailField label="Mobile Number" value={details?.customer_lists?.[0]?.customer_mobile || '-'} />
                <DetailField label="Email" value={details?.customer_email || '-'} />
                <DetailField label="Warehouse Name" value={details?.warehouse_name || '-'} />
                <DetailField label="Created On" value={formatDate(details.date)} />
                <DetailField label="Created By" value={details?.sales_person_name || '-'} />
                <DetailField label="Brand Name" value={details?.brand_name || '-'} />
                <DetailField label="Device Name" value={details?.device_name || '-'} />
                <DetailField label="Consumer Model" value={details?.consumer_model_name || '-'} />
                <DetailField label="IMEI Number" value={details?.imei_no?.toString() || '-'} />
                <DetailField label="Serial Number" value={details?.serial_no || '-'} />
                <DetailField label="Assigned To" value={details?.assignee_name || '-'} />
                <DetailField label="Remarks"
                    value={details?.remarks || '-'}
                    multiline={true}
                    textAlignVertical={'top'} />
                <DetailField label="Pre Condition" value={details?.pre_condition || '-'} />
                <DetailField label="Estimation" value={details?.estimation?.toString() || '-'} />
                <DetailField label="Accessories"
                    value={accessoriesString}
                    multiline={true}
                    textAlignVertical={'top'} />
                <DetailField label="Complaints"
                    value={complaintsString}
                    multiline={true}
                    textAlignVertical={'top'} />
                <DetailField label="Sub Complaints"
                    value={subComplaintsString}
                    multiline={true}
                    textAlignVertical={'top'} />
                <DetailField 
                    label="Remarks"
                    value={details?.service_register_complaint_lists?.[0]?.remarks || '-'}
                    multiline={true}
                    textAlignVertical={'top'} />

                <Button
                    title="UPDATE"
                    backgroundColor={COLORS.primaryThemeColor}
                    onPress={handleUpdateJob}
                    disabled={isJobClosedOrCompleted}
                />

                <CloseModal
                    isVisible={isCloseModalVisible}
                    header='Close'
                    title={'Reason'}
                    multiline
                    numberOfLines={3}
                    onClose={() => setIsCloseModalVisible(!isCloseModalVisible)}
                    onSubmit={handleCloseJob}
                />
                <OverlayLoader visible={isLoading || isSubmitting} />
            </RoundedScrollContainer>
        </SafeAreaView>
    );
};

export default QuickServiceDetails;