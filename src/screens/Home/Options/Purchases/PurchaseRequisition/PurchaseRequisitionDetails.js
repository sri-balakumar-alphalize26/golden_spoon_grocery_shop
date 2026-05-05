import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, FlatList } from 'react-native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { RoundedScrollContainer } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { formatDate } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchPurchaseRequisitionDetails } from '@api/details/detailApi';
import PurchaseDetailList from './PurchaseDetailList';
import { OverlayLoader } from '@components/Loader';
import { Button } from '@components/common/Button';
import { COLORS } from '@constants/theme';
import { post, deleteRequest } from '@api/services/utils';
import { ConfirmationModal } from '@components/Modal';

const PurchaseRequisitionDetails = ({ navigation, route }) => {
    const { id: purchaseId } = route?.params || {};
    const [details, setDetails] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [productLines, setProductLines] = useState([]);
    // console.log("Product Lines :", JSON.stringify(productLines, null, 2));
    const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);
    const [actionToPerform, setActionToPerform] = useState(null);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchPurchaseRequisitionDetails(purchaseId);
            const requestDetails = updatedDetails[0]?.request_details?.[0];
            setDetails(updatedDetails[0] || {});
            setProductLines(requestDetails?.products_lines || []);
        } catch (error) {
            console.error('Error fetching service details:', error);
            showToastMessage('Failed to fetch service details. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (purchaseId) {
                fetchDetails(purchaseId);
            }
        }, [purchaseId])
    );

    const handleSendPurchase = async () => {
        try {
            const data = { _id: details._id };
            const response = await post('/updatePurchaseRequest/push_to_price_enquiry', data);
            if (response.success === true || response.success === 'true') {
                showToastMessage('Purchase Succesfully added to Price Enquiry');
                fetchDetails();
                navigation.navigate('PriceEnquiryScreen');
            } else {
                showToastMessage('Failed. Please try again.');
            }
        } catch (error) {
            showToastMessage('An error occurred. Please try again.');
        }
    };

    const handleDeletePurchase = async () => {
        setIsSubmitting(true);
        try {
            const { _id } = details;
            const response = await deleteRequest(`/viewPurchaseRequest/${_id}`);
            if (response.success === true || response.success === 'true') {
                showToastMessage('Purchase Requisition Deleted Successfully');
                navigation.navigate('PurchaseRequisitionScreen');
            } else {
                showToastMessage('Failed to Delete Purchase. Please try again.');
            }
        } catch (error) {
            showToastMessage('An error occurred. Please try again.');
        } finally {
            fetchDetails();
            setIsSubmitting(false);
        }
    };

    const isSendEnquiry = details?.status === 'Approved';

    return (
        <SafeAreaView>
            <NavigationHeader
                title={details?.sequence_no || 'Purchase Requisition Details'}
                onBackPress={() => navigation.goBack()}
                logo={false}
                iconOneName='edit'
                iconOnePress={() => navigation.navigate('EditPurchaseRequisitionDetails', { id: purchaseId })}
                iconTwoName='delete'
                iconTwoPress={() => {
                    setActionToPerform('delete');
                    setIsConfirmationModalVisible(true);
                }}
            />
            <RoundedScrollContainer>
                <DetailField label="Requested By" value={details?.request_details?.[0]?.requested_by?.employee_name || '-'} />
                <DetailField label="Request Date" value={formatDate(details?.request_details?.[0]?.request_date)} />
                <DetailField label="Warehouse" value={details?.request_details?.[0]?.warehouse?.warehouse_name || '-'} />
                <DetailField label="Require By" value={formatDate(details?.request_details?.[0]?.require_by)} />
                <FlatList
                    data={productLines}
                    renderItem={({ item }) => <PurchaseDetailList item={item} />}
                    keyExtractor={(item) => item._id}
                />

                <Button
                    backgroundColor={COLORS.orange}
                    title="Send To Price Enquiry"
                    onPress={handleSendPurchase}
                    disabled={isSendEnquiry}
                />

                <ConfirmationModal
                    isVisible={isConfirmationModalVisible}
                    onCancel={() => setIsConfirmationModalVisible(false)}
                    headerMessage='Are you sure you want to Delete this?'
                    onConfirm={() => {
                        handleDeletePurchase();
                        setIsConfirmationModalVisible(false);
                    }}
                />
                <OverlayLoader visible={isLoading || isSubmitting} />
            </RoundedScrollContainer>
        </SafeAreaView>
    );
};

export default PurchaseRequisitionDetails;