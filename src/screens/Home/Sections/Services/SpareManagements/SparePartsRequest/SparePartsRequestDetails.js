import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, FlatList } from 'react-native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { RoundedScrollContainer } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { formatDateTime } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchSparePartsDetails } from '@api/details/detailApi';
import SparePartsIssueList from './SparePartsIssueList';
import { OverlayLoader } from '@components/Loader';
import { LoadingButton } from '@components/common/Button';
import { COLORS } from '@constants/theme';
import { post } from '@api/services/utils';
import { ConfirmationModal } from '@components/Modal';

const SparePartsRequestDetails = ({ navigation, route }) => {
    const { id: spareId } = route?.params || {};
    const [details, setDetails] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sparePartsItems, setSparePartsItems] = useState([]);
    const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);
    const [actionToPerform, setActionToPerform] = useState(null);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchSparePartsDetails(spareId);
            setDetails(updatedDetails[0] || {});
            setSparePartsItems(updatedDetails[0]?.spare_parts_line || []);
        } catch (error) {
            console.error('Error fetching spare parts details:', error);
            showToastMessage('Failed to fetch spare parts details. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (spareId) {
                fetchDetails(spareId);
            }
        }, [spareId])
    );

    const handleDeleteJob = async () => {
        setIsSubmitting(true);
        const deleteJobData = {
            spare_id: spareId,
            action: 'delete',
        };
        try {
            const response = await post('/deleteSparePartsRequest', deleteJobData);
            if (response.success === "true") {
                showToastMessage('Job successfully deleted!');
            } else {
                showToastMessage('Failed to delete job. Please try again.');
            }
        } catch (error) {
            console.error('API error:', error);
            showToastMessage('An error occurred. Please try again.');
        } finally {
            fetchDetails();
            setIsSubmitting(false);
            setIsConfirmationModalVisible(false);
        }
    };

    return (
        <SafeAreaView>
            <NavigationHeader
                title={details?.sequence_no || 'Spare Request Details'}
                onBackPress={() => navigation.goBack()}
            />
            <RoundedScrollContainer>
                <DetailField label="Date" value={formatDateTime(details.date)} />
                <DetailField label="Assigned To" value={details?.assigned_to_name || '-'} />
                <DetailField label="Created By" value={details?.created_by?.employee_name || '-'} />
                <DetailField label="Job Registration No" value={details?.job_registrations?.[0]?.sequence_no || '-'} /> 
                <DetailField label="Status" value={details?.status || '-'} />
                <FlatList
                    data={sparePartsItems}
                    renderItem={({ item }) => <SparePartsIssueList item={item} />}
                    keyExtractor={(item) => item._id}
                />
                
                <View style={{ flexDirection: 'row', marginVertical: 20 }}>
                    <LoadingButton
                        width={'50%'}
                        backgroundColor={COLORS.lightRed}
                        title="DELETE"
                        onPress={() => {
                            setActionToPerform('close');
                            setIsConfirmationModalVisible(true);
                        }}
                    />
                    <View style={{ width: 5 }} />
                    <LoadingButton
                        width={'50%'}
                        backgroundColor={COLORS.green}
                        title="ISSUE"
                        onPress={() => navigation.navigate('SparePartsIssueCreation', { id: spareId })}
                    />
                </View>

                <ConfirmationModal
                    isVisible={isConfirmationModalVisible}
                    onCancel={() => setIsConfirmationModalVisible(false)}
                    onConfirm={() => {
                        if (actionToPerform === 'close') {
                            handleDeleteJob();
                        }
                    }}
                    headerMessage='Are you sure you want to delete?'
                />

                <OverlayLoader visible={isLoading || isSubmitting} />
            </RoundedScrollContainer>
        </SafeAreaView>
    );
};

export default SparePartsRequestDetails;
