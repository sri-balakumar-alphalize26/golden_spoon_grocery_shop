import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { View, Text, Image, StyleSheet } from 'react-native';
import { RoundedScrollContainer } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { showToastMessage } from '@components/Toast';
import { formatDate } from '@utils/common/date';
import { formatDateandTime } from '@utils/common/date';
import { fetchPickupDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const PickupDetails = ({ navigation, route }) => {
    const { id: pickupId } = route?.params || {};
    const [details, setDetails] = useState({});
    const [isLoading, setIsLoading] = useState(false);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchPickupDetails(pickupId);
            setDetails(updatedDetails[0] || {});
        } catch (error) {
            console.error('Error fetching Pickup details:', error);
            showToastMessage('Failed to fetch Pickup details. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const SignatureField = ({ label, signature }) => {
        if (signature && (signature.startsWith('http') || signature.startsWith('data:image'))) {
            return (
                <View style={styles.signatureContainer}>
                    <Text style={styles.signatureLabel}>{label}</Text>
                    <Image
                        source={{ uri: signature }}
                        style={styles.signatureImage}
                    />
                </View>
            );
        }
        return <DetailField label={label} value="No signature" />;
    };

    useFocusEffect(
        useCallback(() => {
            if (pickupId) {
                fetchDetails(pickupId);
            }
        }, [pickupId])
    );

    return (
        <SafeAreaView>
            <NavigationHeader
                title={details?.sequence_no || 'Pickup Details'}
                onBackPress={() => navigation.goBack()}
                logo={false}
                iconOneName='edit'
                iconOnePress={() => navigation.navigate('EditPickupDetails', { id: pickupId })}
            />
            <RoundedScrollContainer>
                <DetailField
                    label="Customer Name"
                    value={details?.customer_name ? details.customer_name.trim() : '-'}
                    multiline={true}
                    textAlignVertical={'top'}
                />
                <DetailField label="Brand Name" value={details?.brand_name || '-'} />
                <DetailField label="Device Name" value={details?.device_name || '-'} />
                <DetailField label="Consumer Model" value={details?.consumer_model_name || '-'} />
                <DetailField label="Sequence No" value={details?.sequence_no || '-'} />
                <DetailField label="Date" value={formatDate(details?.date)} />
                <DetailField label="Warehouse" value={details?.warehouse_name || '-'} />
                <DetailField label="Contact Name" value={details?.customer_name || '-'} />
                <DetailField label="Contact No" value={details?.customer_phone_no || '-'} />
                <DetailField label="Contact Email" value={details?.customer_email || '-'} />
                <DetailField label="Pickup Date & Time" value={formatDateandTime(details?.pickup_schedule_time)} />
                <DetailField label="Assignee Name" value={details?.assignee_name || '-'} />
                <DetailField label="Serial No" value={details?.serial_no || '-'} />
                <SignatureField label="Customer Signature" signature={details?.customer_signature} />
                <SignatureField label="Driver Signature" signature={details?.driver_signature} />
                <SignatureField label="Coordinator Signature" signature={details?.service_coordinator_signature} />
                <DetailField label="Remarks"
                    value={details?.remarks || '-'}
                    multiline={true}
                    textAlignVertical={'top'}
                />
                <DetailField
                    label="Customer Address"
                    value={details?.customer_address || '-'}
                    multiline={true}
                    textAlignVertical={'top'}
                />
                <OverlayLoader visible={isLoading} />
            </RoundedScrollContainer>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    label: {
        flex: 2 / 3,
        marginVertical: 8,
        fontSize: 16,
        color: COLORS.primaryThemeColor,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
    signatureContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginVertical: 10,
    },
    signatureLabel: {
        fontSize: 16,
        color: COLORS.primaryThemeColor,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
        flex: 1,
    },
    signatureImage: {
        width: 180,
        height: 100,
        resizeMode: 'contain',
        borderWidth: 1,
        borderColor: COLORS.borderGray,
        marginLeft: 10,
    },
})

export default PickupDetails;
