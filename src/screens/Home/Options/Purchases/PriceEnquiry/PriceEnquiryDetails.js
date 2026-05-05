import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, FlatList } from 'react-native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { RoundedScrollContainer } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { formatDate } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchPriceEnquiryDetails } from '@api/details/detailApi';
import PriceEnquiryDetailList from './PriceEnquiryDetailList';
import { OverlayLoader } from '@components/Loader';
import { Button } from '@components/common/Button';
import { COLORS } from '@constants/theme';
import { post, deleteRequest, put } from '@api/services/utils';
import { ConfirmationModal } from '@components/Modal';
import { useAuthStore } from '@stores/auth';

const PriceEnquiryDetails = ({ navigation, route }) => {
    const { id: priceId, priceLines: updatedPriceLines } = route?.params || {};
    const currentUser = useAuthStore((state) => state.user);
    // console.log("🚀 ~ PriceEnquiryDetails ~ currentUser:", JSON.stringify(currentUser, null, 2));
    const [details, setDetails] = useState({});
    // console.log("🚀 ~ PriceEnquiryDetails ~ details:", JSON.stringify(details, null, 2));
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [priceLines, setPriceLines] = useState(updatedPriceLines || []);
    const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);
    const [actionToPerform, setActionToPerform] = useState(null);
    const [responseData, setResponseData] = useState({});

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchPriceEnquiryDetails(priceId);
            setResponseData(updatedDetails[0] || {});
            const requestDetails = updatedDetails[0]?.request_details?.[0];
            setDetails(updatedDetails[0] || {});
            setPriceLines(requestDetails?.supplier_prices || []);
        } catch (error) {
            console.error('Error fetching price enquiry details:', error);
            showToastMessage('Failed to fetch price enquiry details. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (priceId) {
                fetchDetails();
            }
        }, [priceId])
    );

    const handlePurchaseOrder = async () => {
        setIsSubmitting(true);
        try {
            // Check if suppliers have responded (price lines exist)
            if (!priceLines || priceLines.length === 0) {
                showToastMessage('No supplier responses available yet. Please wait for suppliers to respond with their prices.');
                setIsSubmitting(false);
                return;
            }

            // Filter only approved items for purchase order
            const approvedItems = priceLines.filter(item => item.status === 'Approved');
            
            // Check if any items are approved
            if (approvedItems.length === 0) {
                showToastMessage('Please approve at least one supplier price before creating purchase order.');
                setIsSubmitting(false);
                return;
            }

            const purchaseOrderData = {
                employee_id: currentUser?._id || "",
                product_purchase_enquiry_id: details?._id,
                employee_name: currentUser?.user_name || "",
                bill_date: formatDate(new Date, 'yyyy/MM/dd'),
                order_date: formatDate(new Date, 'yyyy/MM/dd'),
                update_date: formatDate(new Date, 'yyyy/MM/dd'),
                payment_status: "Submitted",
                purchase_enquiry_lines: approvedItems.map(item => ({
                    product_id: item?.products?.product_id,
                    // uom: "", // uom name (units)
                    qty: item?.quantity,
                    unit_price: item?.price,
                    total: (item?.quantity) * (item?.price),
                    supplier_id: item?.supplier?.suplier_id || "",
                    supplier_name: item?.supplier?.suplier_name || "",
                    // taxes: "", // tax id
                    received_quantity: item?.received_quantity || 0,
                    billed_quantity: item?.billed_quantity || 0,
                    scheduled_date: formatDate(new Date, 'yyyy/MM/dd'),
                    // description: item?.description || "",
                })),
                purchase_type: "Local Purchase",
                // currency: "", // currency id
                // country: details?.nationality?.nationality_id || "",
                company: currentUser?.company_id || "",
            };
            console.log("🚀 ~ PriceEnquiryDetails ~ purchaseOrderData:", JSON.stringify(purchaseOrderData, null, 2));
            const response = await post('/createPriceEnquiryPurchaseOrder', purchaseOrderData);
            if (response.success === true || response.success === 'true') {
                showToastMessage('Purchase Order Created Successfully');
                setResponseData(response.data);
                await fetchDetails();
                navigation.navigate('PurchaseOrderScreen');
            } else {
                showToastMessage('Failed to Create Purchase Order. Please try again.');
            }
        } catch (error) {
            console.error('Error creating purchase order:', error);
            showToastMessage('An error occurred. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeletePrice = async () => {
        setIsSubmitting(true);
        try {
            const { _id } = details;
            const response = await deleteRequest(`//${_id}`);
            if (response.success === true || response.success === 'true') {
                showToastMessage('Price Enquiry Deleted Successfully');
                navigation.navigate('PriceEnquiryScreen');
            } else {
                showToastMessage('Failed to Delete Price Enquiry. Please try again.');
            }
        } catch (error) {
            showToastMessage('An error occurred. Please try again.');
        } finally {
            fetchDetails();
            setIsSubmitting(false);
        }
    };

    const isPurchaseOrderDisabled = 
        responseData?.purchase_order_models?.[0]?.status === "purchase_order" || // Already created
        !priceLines || 
        priceLines.length === 0 || // No supplier responses yet
        priceLines.filter(item => item.status === 'Approved').length === 0; // No approved items

    const handleUpdateStatus = async (id, price, isSwitchOn) => {
        const reqBody = {
            _id: id,
            price: price,
            status: isSwitchOn ? 'Approved' : 'Pending'
        }
        await put('/updateSupplierPrices', reqBody);
        fetchDetails();
    }

    return (
        <SafeAreaView>
            <NavigationHeader
                title={details?.sequence_no || 'Price Enquiry Details'}
                onBackPress={() => navigation.goBack()}
                logo={false}
                iconOneName='edit'
                iconOnePress={() => navigation.navigate('EditPriceEnquiryDetails', { id: priceId })}
                iconTwoName='delete'
                iconTwoPress={() => {
                    setActionToPerform('delete');
                    setIsConfirmationModalVisible(true);
                }}
            />
            <RoundedScrollContainer>
                <DetailField label="Requested By" value={details?.request_details?.[0]?.requested_by?.employee_name || '-'} />
                <DetailField label="Updated Date" value={formatDate(details?.request_details?.[0]?.request_date)} />
                <DetailField label="Warehouse" value={details?.request_details?.[0]?.warehouse?.warehouse_name || '-'} />
                <DetailField label="Require By" value={formatDate(details?.request_details?.[0]?.require_by)} />
                <FlatList
                    data={priceLines}
                    renderItem={({ item }) => <PriceEnquiryDetailList item={item} onUpdateStatus={handleUpdateStatus} />}
                    keyExtractor={(item) => item._id}
                />

                <Button
                    backgroundColor={COLORS.tabIndicator}
                    title="Purchase Order"
                    onPress={handlePurchaseOrder}
                    disabled={isPurchaseOrderDisabled}
                />

                <ConfirmationModal
                    isVisible={isConfirmationModalVisible}
                    onCancel={() => setIsConfirmationModalVisible(false)}
                    headerMessage='Are you sure you want to Delete this?'
                    onConfirm={() => {
                        handleDeletePrice();
                        setIsConfirmationModalVisible(false);
                    }}
                />
                <OverlayLoader visible={isLoading || isSubmitting} />
            </RoundedScrollContainer>
        </SafeAreaView>
    );
};

export default PriceEnquiryDetails;