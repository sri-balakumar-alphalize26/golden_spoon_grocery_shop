import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import NavigationHeader from '@components/Header/NavigationHeader';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { formatDate } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchDeliveryNoteDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';
import { Button } from '@components/common/Button';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import DeliveryNoteDetailList from './DeliveryNoteDetailList';

const DeliveryNoteDetails = ({ navigation, route }) => {
    const { id: deliveryNoteId } = route?.params || {};
    const [details, setDetails] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deliveryNotes, setDeliveryNotes] = useState([]);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchDeliveryNoteDetails(deliveryNoteId);
            if (updatedDetails && updatedDetails[0]) {
                setDetails(updatedDetails[0]);
                setDeliveryNotes(updatedDetails[0]?.products_lines || []);
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
            if (deliveryNoteId) {
                fetchDetails(deliveryNoteId);
            }
        }, [deliveryNoteId])
    );

    const hanldePdfDownload = () => {
        navigation.navigate('', { id: deliveryNoteId });
    };

    return (
        <SafeAreaView>
            <NavigationHeader
                title={details?.sequence_no || 'Delivery Note Details'}
                onBackPress={() => navigation.goBack()}
                logo={false}
            />
            <RoundedScrollContainer>
                <DetailField label="Supplier Name" value={details?.supplier?.supplier_name || '-'} />
                <DetailField label="LPO No" value={details?.LPO_no || '-'} />
                <DetailField label="Ordered Date" value={formatDate(details?.order_date)} />
                <DetailField label="Bill Date" value={formatDate(details?.bill_date)} />
                <DetailField label="Purchase Type" value={details?.purchase_type} />
                <DetailField label="Country" value={details?.country?.country_name} />
                <DetailField label="Currency" value={details?.currency?.currency_name} />
                <DetailField label="TRN Number" value={details?.Trn_number?.toString()} />
                <FlatList
                    data={deliveryNotes}
                    renderItem={({ item }) => <DeliveryNoteDetailList item={item} />}
                    keyExtractor={(item) => item._id}
                />

                <View style={styles.totalSection}>
                    <Text style={styles.totalLabel}>Total : </Text>
                    <Text style={styles.totalValue}>{details.total_amount}</Text>
                </View>

                <View style={{ flexDirection: 'row', marginVertical: 20 }}>
                    <Button
                        width={'50%'}
                        backgroundColor={COLORS.tabIndicator}
                        title="Vendor Bill"
                        onPress={() => navigation.navigate('VendorBillScreen', { id: details._id })}
                    />
                    <View style={{ width: 5 }} />
                    <Button
                        width={'50%'}
                        backgroundColor={COLORS.tabIndicator}
                        title="PDF Download"
                        onPress={hanldePdfDownload}
                    />
                </View>
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

export default DeliveryNoteDetails;