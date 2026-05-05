import React, { useCallback, useState } from 'react';
import { FABButton } from '@components/common/Button';
import { RoundedContainer } from '@components/containers';
import { useFocusEffect } from '@react-navigation/native';
import { OverlayLoader } from '@components/Loader';
import { FlatList } from 'react-native';
import { fetchPipelineDetails } from '@api/details/detailApi';
import { VisitList } from '@components/CRM';
import { showToastMessage } from '@components/Toast';

const CustomerVisit = ({ pipelineId, navigation }) => {
    const [customerVisits, setCustomerVisits] = useState([]);
    const [isLoading, setIsLoading] = useState(false)

    const fetchDetails = async (pipelineId) => {
        setIsLoading(true);
        try {
            const [pipelineDetails] = await fetchPipelineDetails(pipelineId);
            setCustomerVisits(pipelineDetails?.customer_visit || []);
        } catch (error) {
            console.error('Error fetching pipeline details:', error);
            showToastMessage('Failed to fetch pipeline details. Please try again.');
        } finally {
            setIsLoading(false)
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (pipelineId) {
                fetchDetails(pipelineId);
            }
        }, [pipelineId])
    );

    return (
        <RoundedContainer>
            <FlatList
                data={customerVisits}
                keyExtractor={(item) => item._id}
                contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
                renderItem={({ item }) => (
                    <VisitList
                        item={item}
                        onPress={() => navigation.navigate('VisitDetails', { visitDetails: { _id: item._id } })}
                    />
                )}
                showsVerticalScrollIndicator={false}
            />
            <FABButton
                onPress={() => navigation.navigate('VisitForm', { pipelineId: pipelineId })} />
            <OverlayLoader visible={isLoading} />
        </RoundedContainer>
    );
};

export default CustomerVisit;
