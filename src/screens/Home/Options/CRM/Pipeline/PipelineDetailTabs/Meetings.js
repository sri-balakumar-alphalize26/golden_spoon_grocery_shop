import React, { useState, useCallback } from 'react';
import { RoundedContainer } from '@components/containers';
import { useFocusEffect } from '@react-navigation/native';
import { showToastMessage } from '@components/Toast';
import { fetchPipelineDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';
import { post } from '@api/services/utils';
import { MeetingsScheduleModal } from '@components/Modal';
import { FABButton } from '@components/common/Button';
import { useAuthStore } from '@stores/auth';
import { formatDateTime } from '@utils/common/date';
import { FlatList } from 'react-native';
import { MeetingsList } from '@components/CRM';

const Meetings = ({ pipelineId }) => {
    const currentUser = useAuthStore((state) => state.user);
    const [isLoading, setIsLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [meetingsHistory, setMeetingsHistory] = useState([]);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const [updatedDetails] = await fetchPipelineDetails(pipelineId);
            const history = updatedDetails?.customer_schedules
            setMeetingsHistory(history)
        } catch (error) {
            console.error('Error fetching meetings details:', error);
            showToastMessage('Failed to fetch meetings details. Please try again.');
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
            const formattedDate = formatDateTime(updateText.start, "Pp");
            const pipelineHistoryData = {
                start: formattedDate,
                title: updateText.title,
                pipeline_id: pipelineId,
                employee_id: currentUser?._id,
                is_Remainder: updateText.isReminder,
                minutes: updateText?.isReminder ? updateText?.reminderMinutes : 0,
                type: 'Pipeline'
            };
            const response = await post('/createCustomerSchedule', pipelineHistoryData);
            if (response.success === 'true') {
                showToastMessage('Meetings created successfully');
            } else {
                showToastMessage('Meetings creation failed');
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
                data={meetingsHistory}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                    <MeetingsList
                        item={item}
                    />
                )}
                contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
                showsVerticalScrollIndicator={false}
            />
            <MeetingsScheduleModal
                isVisible={isModalVisible}
                title={'Schedule Meeting'}
                placeholder='Enter Meeting'
                onClose={() => setIsModalVisible(!isModalVisible)}
                onSave={saveUpdates}
            />
            <FABButton onPress={() => setIsModalVisible(!isModalVisible)} />
            <OverlayLoader visible={isLoading} />
        </RoundedContainer>
    );
};

export default Meetings;
