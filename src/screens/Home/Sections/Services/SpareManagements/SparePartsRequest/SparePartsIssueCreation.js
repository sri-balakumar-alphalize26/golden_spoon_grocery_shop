import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Text, View, FlatList, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { RoundedScrollContainer } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { formatDateTime } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchSparePartsDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';
import { LoadingButton } from '@components/common/Button';
import { COLORS } from '@constants/theme';
import { post } from '@api/services/utils';
import { useAuthStore } from '@stores/auth';
import { Checkbox } from 'react-native-paper';
import { FONT_FAMILY } from '@constants/theme';

const SparePartsIssueCreation = ({ navigation, route }) => {
    const { id: spareId } = route?.params || {};
    const [details, setDetails] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const currentUser = useAuthStore((state) => state.user);
    const [sparePartsItems, setSparePartsItems] = useState([]);
    const [selectedItems, setSelectedItems] = useState([]);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const updatedDetails = await fetchSparePartsDetails(spareId);
            setDetails(updatedDetails[0] || {});
            setSparePartsItems(updatedDetails[0]?.spare_parts_line || []);
        } catch (error) {
            console.error('Error fetching spare parts details:', error);
            showToastMessage('Failed to fetch spare parts details. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectItem = (item) => {
        const isSelected = selectedItems.includes(item._id);
        const newSelectedItems = isSelected
            ? selectedItems.filter(i => i !== item._id)
            : [...selectedItems, item._id];
        setSelectedItems(newSelectedItems);
    };

    const renderItem = ({ item }) => {
        const isSelected = selectedItems.includes(item._id);
        return (
            <TouchableOpacity onPress={() => handleSelectItem(item)} activeOpacity={0.8} style={styles.itemContainer}>
            <View style={styles.leftColumn}>
                <Text style={styles.head}>{item?.name?.trim() || '-'}</Text>
                <Text style={styles.contentRight}>{item?.quantity}</Text>
                <Text style={styles.content}>{item?.uom || '-'}</Text>
            </View>
            <View style={styles.rightColumn}>
                <Checkbox
                    status={isSelected ? 'checked' : 'unchecked'}
                    onPress={() => handleSelectItem(item)}
                    color={COLORS.primaryThemeColor}
                    style={styles.checkbox}
                />
            </View>
        </TouchableOpacity>
        );
    };

    useFocusEffect(
        useCallback(() => {
            if (spareId) {
                fetchDetails(spareId);
            }
        }, [spareId])
    );

    const handleSubmit = async () => {
        if (selectedItems.length === 0) {
            showToastMessage('Please select Spare Parts before submitting.');
            return;
        }

        setIsSubmitting(true);
        try {
            const issueSpareData = {
                date: new Date(),
                created_by: currentUser?.related_profile?._id,   
                assigned_to: currentUser?.related_profile?._id,
                assigned_to_name: details.assigned_to_name,
                status: "Closed",
                warehouse_id: details.warehouse_id, 
                warehouse_name: details.warehouse_name,
                job_registration_id: details._id,
                issue_type: "job_registration",
                spare_parts_request_id: details.raw_material_line_ids[0]?.spare_parts_request_id,
                job_diagnosis_parts_ids: details.spare_parts_line.map(item => item?.job_diagnosis_parts_id),
                spare_parts_line_id: details.spare_parts_line.map(item => item?._id),
            };
    
            console.log("🚀 ~ issueSpareData:", issueSpareData);
    
            const response = await post('/createSparePartsIssue', issueSpareData);
            console.log("🚀 ~ handleSubmit ~ response:", response);
    
            if (response.success === "true") {
                showToastMessage('Spare parts issue successfully created.');
                navigation.navigate('SparePartsRequestScreen');
            } else {
                showToastMessage('Failed to submit spare parts issue. Please try again.');
            }
        } catch (error) {
            console.error('API error:', error);
            showToastMessage('An error occurred. Please try again.');
        } finally {
            fetchDetails();
            setIsSubmitting(false);
        }
    };
    
    
    return (
        <SafeAreaView>
            <NavigationHeader
                title={"Spare Parts Issue Creation"}
                onBackPress={() => navigation.goBack()}
            />
            <RoundedScrollContainer>
                <DetailField label="Date" value={formatDateTime(details.date)} />
                <DetailField label="Assigned To" value={details?.assigned_to_name || '-'} />
                <DetailField label="Job Registration No" value={details?.sequence_no || '-'} />
                <DetailField label="Spare Part Request" value={details?.job_registrations?.[0]?.sequence_no || '-'} />
                <DetailField label="Warehouse" value={details?.warehouse_name || '-'} />
                <FlatList
                    data={sparePartsItems}
                    renderItem={renderItem}
                    keyExtractor={(item) => item._id}
                />
                <View style={{ backgroundColor: 'white', paddingHorizontal: 50, paddingBottom: 12 }}>
                    <LoadingButton
                        onPress={handleSubmit}
                        title={'Submit'}
                        backgroundColor={COLORS.green}
                        loading={isSubmitting} />
                </View>
                <OverlayLoader visible={isLoading || isSubmitting} />
            </RoundedScrollContainer>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 5,
        marginVertical: 5,
        backgroundColor: 'white',
        borderRadius: 15,
        ...Platform.select({
            android: {
                elevation: 4,
            },
            ios: {
                shadowColor: 'black',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
            },
        }),
        padding: 20,
    },
    head: {
        fontFamily: FONT_FAMILY.urbanistBold,
        fontSize: 17,
        marginBottom: 5,
        flexDirection: "row",
    },
    contentRight: {
        color: '#666666',
        fontFamily: FONT_FAMILY.urbanistSemiBold,
        fontSize: 15,
    },
    content: {
        color: '#666666',
        marginBottom: 5,
        fontSize: 15,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
        textTransform: 'capitalize',
    },
    rightColumn: {
        flexDirection: 'row',  
        alignItems: 'center',  
        justifyContent: 'flex-end',
        flex: 1,
    },
    checkbox: {
        marginLeft: 15,
        alignSelf: 'center',
        position: "fixed",
    },
});

export default SparePartsIssueCreation;
