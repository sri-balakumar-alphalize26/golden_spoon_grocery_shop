import React, { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, FlatList, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { RoundedScrollContainer } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { formatDate } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchPurchaseOrderDetails } from '@api/details/detailApi';
import PurchaseOrderDetailList from './PurchaseOrderDetailList';
import { OverlayLoader } from '@components/Loader';
import { Button } from '@components/common/Button';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { put, deleteRequest } from '@api/services/utils';
import { ConfirmationModal, MenuModal } from '@components/Modal';

const PurchaseOrderDetails = ({ navigation, route }) => {
    const { id: purchaseOrderId } = route?.params || {};
    const [details, setDetails] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [purchaseOrderLines, setPurchaseOrderLines] = useState([]);
    const [isMenuModalVisible, setIsMenuModalVisible] = useState(false);
    const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchPurchaseOrderDetails(purchaseOrderId);
            if (updatedDetails && updatedDetails[0]) {
                setDetails(updatedDetails[0]);
                setPurchaseOrderLines(updatedDetails[0]?.products_lines || []);
            }
        } catch (error) {
            console.error('Error fetching purchase order details:', error);
            showToastMessage('Failed to fetch purchase order details. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (purchaseOrderId) {
                fetchDetails(purchaseOrderId);
            }
        }, [purchaseOrderId])
    );
    
    // const { taxTotal } = useMemo(() => {
    //     let taxes = 0;
    //     purchaseOrderLines.forEach((item) => {
    //         taxes += item.tax_value || item.tax || 0;
    //     });
    //     return {
    //         taxTotal: taxes.toFixed(2),
    //     };
    // }, [purchaseOrderLines]);
    
    const handleVendorBill = async () => {
        navigation.navigate('VendorBillFormTabs', { id: purchaseOrderId });
    };
    
    const handleDeliveryNote = () => {
        navigation.navigate('DeliveryNoteCreation', { id: purchaseOrderId });
    };
    
    const handleDeletePurchaseOrder = async () => {
        setIsSubmitting(true);
        try {
            const response = await deleteRequest(`/viewPurchaseOrder/${details._id}`);
            if (response.success) {
                showToastMessage('Purchase Order Deleted Successfully');
                navigation.navigate('PurchaseOrderScreen');
            } else {
                showToastMessage('Failed to Delete Purchase Order. Please try again.');
            }
        } catch (error) {
            showToastMessage('An error occurred. Please try again.');
        } finally {
            setIsSubmitting(false);
            fetchDetails();
        }
    };

    const handleCancelPurchaseOrder = async () => {
        setIsSubmitting(true);
        try {
            const response = await put(`/updatePurchaseOrder`, {
                _id: details._id,
                status: "Cancelled",
                payment_status: "Cancelled",
                update_purchase_line_ids: [],
                create_purchase_line_ids: [],
                delete_purchase_line_ids: [],
            });
            if (response.success == true) {
                showToastMessage('Purchase Order Cancelled Successfully');
                navigation.navigate("PurchaseOrderScreen")
                fetchDetails();
            } else {
                showToastMessage('Purchase Order Cancelled Successfully.');
                navigation.navigate("PurchaseOrderScreen")
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
                title={details?.sequence_no || 'Purchase Order Details'}
                onBackPress={() => navigation.goBack()}
                logo={false}
                iconOneName='edit'
                iconOnePress={() => navigation.navigate('EditPurchaseOrderDetails', { id: purchaseOrderId })}
                iconTwoName='menu-fold'
                iconTwoPress={() => setIsMenuModalVisible(true)}
            />
            <RoundedScrollContainer>
                <DetailField label="Sequence No" value={details?.sequence_no || '-'} />
                <DetailField label="Supplier Name" value={details?.supplier?.supplier_name || '-'} />
                <DetailField label="Ordered Date" value={formatDate(details?.order_date)} />
                <DetailField label="Bill Date" value={formatDate(details?.bill_date)} />
                <DetailField label="Purchase Type" value={details?.purchase_type || '-'} />
                <DetailField label="Country" value={details?.country?.country_name || '-'} />
                <DetailField label="Currency" value={details?.currency?.currency_name || '-'} />
                <DetailField label="TRN Number" value={details?.Trn_number?.toString() || '-'} />
                <FlatList
                    data={purchaseOrderLines}
                    renderItem={({ item }) => <PurchaseOrderDetailList item={item} />}
                    keyExtractor={(item) => item._id}
                />

                <View style={{ marginVertical: 2 }}>
                <View style={styles.totalSection}>
                    <Text style={styles.totalLabel}>Untaxed Amount : </Text>
                    <Text style={styles.totalValue}>
                    {details.untaxed_total_amount 
                    ? details.untaxed_total_amount 
                    : details?.products_lines?.reduce((total, line) => total + (line?.sub_total || 0), 0)}
                    </Text>
                </View>
                <View style={styles.totalSection}>
                    <Text style={styles.totalLabel}>Taxes : </Text>
                    <Text style={styles.totalValue}>{(details.total_amount)-(details.untaxed_total_amount) || 0}</Text>
                    {/* <Text style={styles.totalValue}>{taxTotal}</Text> */}
                </View>
                <View style={styles.totalSection}>
                    <Text style={styles.totalLabel}>Total : </Text>
                    <Text style={styles.totalValue}>{details.total_amount}</Text>
                </View>
            </View>

            <View style={{ flexDirection: 'row', marginVertical: 5 }}>
                <Button
                    width={'50%'}
                    backgroundColor={COLORS.lightRed}
                    title="DELETE"
                    onPress={() => {
                        setIsConfirmationModalVisible(true);
                    }}
                />
                <View style={{ width: 5 }} />
                <Button
                    width={'50%'}
                    backgroundColor={COLORS.tabIndicator}
                    title="Vendor Bills"
                    onPress={handleVendorBill}
                />
            </View>

            <ConfirmationModal
                isVisible={isConfirmationModalVisible}
                onCancel={() => setIsConfirmationModalVisible(false)}
                headerMessage="Are you sure you want to delete this?"
                onConfirm={() => {
                    handleDeletePurchaseOrder();
                    setIsConfirmationModalVisible(false);
                }}
            />

            <MenuModal
                isVisible={isMenuModalVisible}
                onCancel={() => setIsMenuModalVisible(false)}
                onOptionSelect={(option) => {
                    if (option === 'Delivery Note') handleDeliveryNote();
                    else if (option === 'PO Cancel') handleCancelPurchaseOrder();
                    // else if (option === 'Send PO') handleSendPO();
                    // else if (option === 'Shipment') handleShipment();
                }}
            />
            <OverlayLoader visible={isLoading || isSubmitting} />
          </RoundedScrollContainer>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    label: {
      marginVertical: 5,
      fontSize: 16,
      color: COLORS.primaryThemeColor,
      fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
    totalSection: {
      flexDirection: 'row',
      marginVertical: 5,
      margin: 10,
      alignSelf: "center",
    },
    totalLabel: {
      fontSize: 16,
      fontFamily: FONT_FAMILY.urbanistBold,
    },
    totalValue: {
      fontSize: 16,
      fontFamily: FONT_FAMILY.urbanistBold,
      color: '#666666',
    },
  });

export default PurchaseOrderDetails;