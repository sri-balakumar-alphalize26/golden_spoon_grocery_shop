import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { View, Text, Image, StyleSheet, FlatList, TouchableOpacity, Linking } from 'react-native';
import { RoundedScrollContainer } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { showToastMessage } from '@components/Toast';
import { formatDate } from '@utils/common/date';
import { fetchAuditingDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const AuditDetails = ({ navigation, route }) => {
    const { id: auditId } = route?.params || {};
    const [details, setDetails] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState(false);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchAuditingDetails(auditId);
            setDetails(updatedDetails[0] || {});
        } catch (error) {
            console.error('Error fetching Audit details:', error);
            showToastMessage('Failed to fetch Audit details. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const SignatureField = ({ label, signature }) => {
        if (signature && (signature.startsWith('http') || signature.startsWith('https') || signature.startsWith('data:image'))) {
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

    const handleOpenDocument = (url) => {
        Linking.canOpenURL(url)
            .then((supported) => {
                if (!supported) {
                    Alert.alert('Error', 'Unable to open document');
                } else {
                    return Linking.openURL(url);
                }
            })
            .catch((err) => console.error('Error opening document:', err));
    };
    
    const AttachmentField = ({ label, attachments }) => {
        if (attachments && attachments.length > 0) {
            return (
                <View>
                    <Text style={styles.attachmentLabel}>{label}</Text>
                    <FlatList
                        data={attachments}
                        keyExtractor={(item, index) => index.toString()}
                        horizontal
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                onPress={() => handleOpenDocument(item)}
                                style={styles.documentContainer}
                            >
                                <Image
                                    source={{ uri: item }}
                                    style={styles.attachmentImage}
                                />
                            </TouchableOpacity>
                        )}
                        showsHorizontalScrollIndicator={false}
                    />
                </View>
            );
        }
        return <DetailField label={label} value="No attachments available" />;
    };

    useFocusEffect(
        useCallback(() => {
            if (auditId) {
                fetchDetails(auditId);
            }
        }, [auditId])
    );

    return (
        <SafeAreaView>
            <NavigationHeader
                title={details?.sequence_no || 'Audit Details'}
                onBackPress={() => navigation.goBack()}
                logo={false}
            />
            <RoundedScrollContainer>
                <DetailField
                    label="Partner"
                    value={details?.customer_name || '-'}
                    multiline={true}
                    textAlignVertical={'top'}
                />
                <DetailField label="Date" value={formatDate(details?.date)} />
                <DetailField label="Amount" value={details?.amount?.toFixed(2) || '-'} />
                <DetailField label="Tax" value={((details?.taxed_amount - details?.amount)?.toFixed(2)) || '-'} />
                <DetailField label="Total" value={details?.taxed_amount?.toFixed(2) || '-'} />
                <DetailField label="Sales Person" value={details?.sales_person_name || '-'} />
                <DetailField label="Warehouse" value={details?.warehouse_name || '-'} />
                <DetailField label="Company" value={details?.company_name || '-'} />
                <DetailField label="Invoice No" value={details?.inv_sequence_no || '-'} />
                <DetailField label="Collection Type" value={details?.collection_type_name || '-'} />
                <SignatureField label="Customer Signature" signature={details?.customer_vendor_signature} />
                <AttachmentField label="Attachments" attachments={details?.attachments} />
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
    attachmentLabel: {
        fontSize: 16,
        color: COLORS.primaryThemeColor,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
        flex: 1,
        marginVertical: 20,
    },
    attachmentImage: {
        width: 180,
        height: 100,
        resizeMode: 'contain',
        borderWidth: 1,
        borderColor: COLORS.borderGray,
        marginLeft: 120,
    },
});

export default AuditDetails;