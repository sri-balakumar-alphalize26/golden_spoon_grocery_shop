import React, { useState, useCallback } from 'react';
import { RoundedContainer } from '@components/containers';
import { useFocusEffect } from '@react-navigation/native';
import { showToastMessage } from '@components/Toast';
import { fetchLeadDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';
import { post } from '@api/services/utils';
import { AddUpdateModal } from '@components/Modal';
import { FABButton } from '@components/common/Button';
import { useAuthStore } from '@stores/auth';
import { formatDateTime } from '@utils/common/date';
import { FlatList } from 'react-native';
import { FollowUpList } from '@components/CRM';

const FollowUp = ({ leadId }) => {

    const currentUser = useAuthStore((state) => state.user);
    const [isLoading, setIsLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [followUpHistory, setFollowUpHistory] = useState([]);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchLeadDetails(leadId);
            const history = updatedDetails[0]?.lead_histories
            setFollowUpHistory(history)
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


    const saveUpdates = async (updateText) => {
        try {
            const formattedDate = formatDateTime(new Date(), "Pp");
            const leadHistoryData = {
                date: formattedDate,
                remarks: updateText || null,
                employee_id: currentUser._id,
                lead_id: leadId
            };
            const response = await post('/createLeadHistory', leadHistoryData);

            if (response.success === 'true') {
                showToastMessage('Lead history created successfully');
            } else {
                showToastMessage('Lead history creation failed');
            }
        } catch (error) {
            console.log("API Error:", error);
        } finally {
            fetchDetails();
        }
    };

    return (
        <RoundedContainer paddingHorizontal={0}>
            <FlatList
                data={followUpHistory}
                keyExtractor={(item) => item._id}
                contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
                renderItem={({ item }) => (
                    <FollowUpList
                        item={item}
                    />
                )}
                showsVerticalScrollIndicator={false}
            />
            <AddUpdateModal
                isVisible={isModalVisible}
                header='Add Follow Up'
                title={'Add Updates'}
                placeholder='Add follow up'
                onClose={() => setIsModalVisible(!isModalVisible)}
                onSubmit={saveUpdates}
            />
            <OverlayLoader visible={isLoading} />
            <FABButton onPress={() => setIsModalVisible(!isModalVisible)} />
        </RoundedContainer>
    );
};

export default FollowUp;
