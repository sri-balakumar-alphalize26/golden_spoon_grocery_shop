import React, { useState, useCallback } from 'react';
import { View, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { RoundedScrollContainer } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { formatDate } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchPurchaseRequisitionDetails } from '@api/details/detailApi';
import EditPurchaseDetailList from './EditPurchaseDetailList';
import { OverlayLoader } from '@components/Loader';
import { Button } from '@components/common/Button';
import { COLORS } from '@constants/theme';
import { put } from '@api/services/utils';

const EditPurchaseRequisitionDetails = ({ navigation, route }) => {
    const { id: purchaseId } = route?.params || {};
    const [details, setDetails] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [productLines, setProductLines] = useState([]);
    const [selectedSuppliers, setSelectedSuppliers] = useState([]);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchPurchaseRequisitionDetails(purchaseId);
            const requestDetails = updatedDetails[0]?.request_details?.[0];
            setDetails(updatedDetails[0] || {});
            setProductLines(requestDetails?.products_lines || []);
            setSelectedSuppliers([{ id: requestDetails?.supplier?._id, label: requestDetails?.supplier?.name }]);
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

    const handleSubmitPurchase = async () => {
        setIsSubmitting(true);
        try {
          const updateData = {
            _id: details._id,
            // supplier_id: selectedSuppliers.map(supplier => supplier.id),
            supplier_id: productLines.flatMap((line) =>
              line.suppliers?.map((supplier) => supplier.supplier_id) || []
            ),
            product_lines: productLines,
          };
          console.log("🚀 ~ EditPurchaseRequisitionDetails ~ Updated Suppliers:", JSON.stringify(updateData, null, 2));
          const response = await put('/updatePurchaseRequest', updateData);
          if (response.success === "true") {
            showToastMessage('Successfully Added Suppliers');
            navigation.navigate('PurchaseRequisitionDetails', { id: purchaseId });
          } else {
            showToastMessage('Failed to update purchase. Please try again.');
          }
        } catch (error) {
          showToastMessage('An error occurred. Please try again.');
        } finally {
          setIsSubmitting(false);
        }
    };

    return (
        <SafeAreaView>
            <NavigationHeader
                title={details?.sequence_no || 'Purchase Requisition Details'}
                onBackPress={() => navigation.goBack()}
                logo={false}
            />
            <RoundedScrollContainer>
                <DetailField label="Requested By" value={details?.request_details?.[0]?.requested_by?.employee_name || '-'} />
                <DetailField label="Request Date" value={formatDate(details?.request_details?.[0]?.request_date)} />
                <DetailField label="Warehouse" value={details?.request_details?.[0]?.warehouse?.warehouse_name || '-'} />
                <DetailField label="Require By" value={formatDate(details?.request_details?.[0]?.require_by)} />
                {/* <FlatList
                    data={productLines}
                    renderItem={({ item }) => <EditPurchaseDetailList item={item} />}
                    keyExtractor={(item) => item._id}
                /> */}
                <FlatList
                    data={productLines}
                    renderItem={({ item }) => ( <EditPurchaseDetailList item={item}
                        onSupplierChange={(selectedValues) => {
                            setProductLines((prevLines) =>
                            prevLines.map((line) =>
                                line._id === selectedValues._id ? selectedValues : line
                            ));
                        }} />
                    )}
                    keyExtractor={(item) => item._id}
                />

                <Button
                    backgroundColor={COLORS.tabIndicator}
                    title="SUBMIT"
                    onPress={handleSubmitPurchase}
                />
                <OverlayLoader visible={isLoading || isSubmitting} />
            </RoundedScrollContainer>
        </SafeAreaView>
    );
};

export default EditPurchaseRequisitionDetails;