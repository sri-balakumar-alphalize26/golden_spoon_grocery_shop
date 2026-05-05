import React, { useState, useCallback } from 'react';
import { RoundedContainer } from '@components/containers';
import { useFocusEffect } from '@react-navigation/native';
import { showToastMessage } from '@components/Toast';
import { fetchPipelineDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';
import { post } from '@api/services/utils';
import { AddUpdateModal } from '@components/Modal';
import { FABButton } from '@components/common/Button';
import { useAuthStore } from '@stores/auth';
import { formatDateTime } from '@utils/common/date';
import { FlatList } from 'react-native';
import { FollowUpList } from '@components/CRM';

const FollowUp = ({ pipelineId }) => {

    const currentUser = useAuthStore((state) => state.user);
    const [isLoading, setIsLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [followUpHistory, setFollowUpHistory] = useState([]);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchPipelineDetails(pipelineId);
            const history = updatedDetails[0]?.pipeline_histories
            setFollowUpHistory(history)
        } catch (error) {
            console.error('Error fetching Pipeline details:', error);
            showToastMessage('Failed to fetch Pipeline details. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchDetails();
        }, [pipelineId])
    );

    const saveUpdates = async (updateText) => {
        try {
            const formattedDate = formatDateTime(new Date(), "Pp");
            const pipelineHistoryData = {
                date: formattedDate,
                remarks: updateText || null,
                employee_id: currentUser._id,
                pipeline_id: pipelineId,
            };
            const response = await post('/createPipelineHistory', pipelineHistoryData);

            if (response.success === 'true') {
                showToastMessage('Pipeline created successfully');
            } else {
                showToastMessage('Pipeline creation failed');
            }
        } catch (error) {
            console.log("API Error:", error);
        } finally {
            fetchDetails();
        }
    };

    return (
        <RoundedContainer>
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
