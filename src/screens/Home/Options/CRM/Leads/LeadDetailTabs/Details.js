import React, { useState, useCallback } from 'react';
import { RoundedScrollContainer } from '@components/containers';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { DetailField } from '@components/common/Detail';
import { formatDate } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchLeadDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';
import { LoadingButton } from '@components/common/Button';
import { COLORS } from '@constants/theme';
import { showToast } from '@utils/common';
import { post } from '@api/services/utils';

const Details = ({ leadId }) => {
    const navigation = useNavigation();
    const [details, setDetails] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchLeadDetails(leadId);
            setDetails(updatedDetails[0]);
        } catch (error) {
            console.error('Error fetching Lead details:', error);
            showToastMessage('Failed to fetch lead details. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchDetails();
        }, [leadId])
    );

    const convertOpportunity = async () => {
        setIsSubmitting(true);
        try {
            const convertOpportunityId = {
                lead_id: leadId
            };
            const response = await post('/convertToOpertunity', convertOpportunityId);
            if (response.success === "true") {
                showToast({
                    type: 'success',
                    title: 'Success',
                    message: 'Successfully created pipeline & customer!'
                });
            } else {
                showToast({
                    type: 'error',
                    title: 'Error',
                    message: 'Failed to convert opportunity. Please try again.'
                });
            }
        } catch (error) {
            console.error('API error:', error);
            showToast({
                type: 'error',
                title: 'Error',
                message: 'An error occurred. Please try again.'
            });
        } finally {
            fetchDetails();
            setIsSubmitting(false);
        }
    };

    const viewOpportunity = () => {
        navigation.navigate('PipelineDetailTabs', { id: details?.pipeline[0]?._id });
    };

    return (
        <RoundedScrollContainer>
            <DetailField label="Date" value={formatDate(details.date)} />
            <DetailField label="Status" value={details?.status || '-'} />
            <DetailField label="Priority" value={details?.priority || '-'} />
            <DetailField label="Source" value={details?.source?.source_name || '-'} />
            <DetailField label="Company Name" value={details?.company_name || '-'} />
            <DetailField label="Contact Name" value={details?.contact_name || '-'} />
            <DetailField label="Sales Person" value={details?.sales_preson?.sales_preson_name || '-'} />
            <DetailField label="Created By" value={details?.created_by_name || '-'} />
            <DetailField label="Email" value={details?.email || '-'} />
            <DetailField label="Phone no." value={details?.phone_no || '-'} />
            <DetailField label="Whatsapp no." value={details?.whatsapp_no || '-'} />
            <DetailField label="Address" value={details?.address || '-'} />
            <DetailField label="Job Position" value={details?.job_position || '-'} />
            <DetailField
                label="Remarks"
                value={details?.remarks || '-'}
                multiline
                numberOfLines={5}
                textAlignVertical={'top'}
            />
            <LoadingButton
                marginVertical={20}
                width={'50%'}
                alignSelf={'center'}
                backgroundColor={COLORS.primaryThemeColor}
                title={details?.status === 'opportunity' ? 'VIEW OPPORTUNITY' : 'CONVERT TO OPPORTUNITY'}
                onPress={details?.status === 'opportunity' ? viewOpportunity : convertOpportunity}
                loading={isSubmitting}
            />
            <OverlayLoader visible={isLoading} />
        </RoundedScrollContainer>
    );
};

export default Details;
