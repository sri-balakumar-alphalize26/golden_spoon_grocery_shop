import React, { useState, useCallback } from 'react';
import { View, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import NavigationHeader from '@components/Header/NavigationHeader';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { formatDate } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchPriceEnquiryDetails } from '@api/details/detailApi';
import EditPriceEnquiryDetailList from './EditPriceEnquiryDetailList';
import { OverlayLoader } from '@components/Loader';
import { Button } from '@components/common/Button';
import { COLORS } from '@constants/theme';
import { put, get } from '@api/services/utils';

const EditPriceEnquiryDetails = ({ navigation, route }) => {
    const { id: priceId } = route?.params || {};
    const [details, setDetails] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [priceLines, setPriceLines] = useState([]);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchPriceEnquiryDetails(priceId);
            const requestDetails = updatedDetails[0]?.request_details?.[0];
            setDetails(updatedDetails[0] || {});
            setPriceLines(requestDetails?.supplier_prices || []);
        } catch (error) {
            console.error('Error fetching service details:', error);
            showToastMessage('Failed to fetch service details. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (priceId) {
                fetchDetails(priceId);
            }
        }, [priceId])
    );

    const handleEditPrice = async () => {
        setIsSubmitting(true);
        try {
            const validPriceLines = priceLines
                .filter(({ _id, price, status }) => _id && price != null && status)
                .map(({ _id, price }) => ({
                    _id,
                    price: parseFloat(price),
                    status: "Pending",
                }));

            const updateData = {
                _id: details._id,
                supplier_price_array: validPriceLines,
            };
            const response = await put('/updateSupplierPriceArray', updateData);
            if (response && (response.status === "true" || response.status === true)) {
                showToastMessage('Successfully Added Price');
                navigation.navigate('PriceEnquiryDetails', { id: priceId });
            } else {
                showToastMessage('Failed to update price. Please try again.');
            }
        } catch (error) {
            console.error('Error in handleEditPrice:', error.message || 'Unknown error');
            showToastMessage('An error occurred. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <SafeAreaView>
            <NavigationHeader
                title={details?.sequence_no || 'Edit Purchase Details'}
                onBackPress={() => navigation.goBack()}
                logo={false}
            />
            <RoundedScrollContainer>
                <DetailField label="Requested By" value={details?.request_details?.[0]?.requested_by?.employee_name || '-'} />
                <DetailField label="Request Date" value={formatDate(details?.request_details?.[0]?.request_date)} />
                <DetailField label="Warehouse" value={details?.request_details?.[0]?.warehouse?.warehouse_name || '-'} />
                <DetailField label="Require By" value={formatDate(details?.request_details?.[0]?.require_by)} />

                <FlatList
                    data={priceLines}
                    renderItem={({ item }) => (
                        <EditPriceEnquiryDetailList
                            item={item}
                            onPriceChange={(id, newPrice) => {
                                setPriceLines((prevLines) =>
                                    prevLines.map((line) =>
                                        line._id === id ? { ...line, price: parseFloat(newPrice) || line.price } : line
                                    )
                                );
                            }}
                        />
                    )}
                    keyExtractor={(item) => item._id}
                />

                <Button
                    backgroundColor={COLORS.green}
                    title="SUBMIT"
                    onPress={handleEditPrice}
                />

                <OverlayLoader visible={isLoading || isSubmitting} />
            </RoundedScrollContainer>
        </SafeAreaView>
    );
};

export default EditPriceEnquiryDetails;