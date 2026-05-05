import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { VerticalScrollableCalendar } from '@components/Calendar';
import { NavigationHeader } from '@components/Header';
import { ConfirmationModal, RulesModal } from '@components/Modal';
import { Button, FABButton } from '@components/common/Button';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useDataFetching } from '@hooks';
import { fetchVisitPlan } from '@api/services/generalApi';
import { FlashList } from '@shopify/flash-list';
import VisitPlanList from './VisitPlanList';
import { formatData } from '@utils/formatters';
import { EmptyState } from '@components/common/empty';
import AnimatedLoader from '@components/Loader/AnimatedLoader';
import { formatDate } from 'date-fns';
import { useAuthStore } from '@stores/auth';
import { showToast } from '@utils/common';
import { put } from '@api/services/utils';
import { COLORS } from '@constants/theme';

const VisitsPlanScreen = ({ navigation }) => {
    const isFocused = useNavigation();
    const currentUserId = useAuthStore(state => state.user?.related_profile?._id);
    const [isVisible, setIsVisible] = useState(false);
    const [date, setDate] = useState(new Date());
    const formattedDate = formatDate(date, 'yyyy-MM-dd');
    const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);

    const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchVisitPlan);

    const visitPlansNew = data.filter(visitPlan => visitPlan.approval_status === 'New');
    const allPending = data.every(visitPlan => visitPlan.approval_status === 'Pending');

    const visitPlanIdsForApproval = visitPlansNew.map(visitPlan => visitPlan._id);

    useFocusEffect(
        useCallback(() => {
            fetchData({ date: formattedDate, employeeId: currentUserId });
        }, [date])
    );

    useEffect(() => {
        if (isFocused) {
            fetchData({ date: formattedDate, employeeId: currentUserId });
        }
    }, [isFocused, date]);

    const handleLoadMore = () => {
        fetchMoreData({ date: formattedDate, employeeId: currentUserId });
    };

    const renderItem = ({ item }) => {
        if (item.empty) {
            return <EmptyItem />;
        }
        return <VisitPlanList item={item} onPress={() => navigation.navigate('VisitPlanDetails', { id: item._id })} />;
    };

    const renderEmptyState = () => (
        <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message={'No Visits Plan Found....'} />
    );

    const renderContent = () => (
        <FlashList
            data={formatData(data, 1)}
            numColumns={1}
            renderItem={renderItem}
            keyExtractor={(item, index) => index.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
            onEndReached={handleLoadMore}
            showsVerticalScrollIndicator={false}
            onEndReachedThreshold={0.2}
            ListFooterComponent={
                loading && (
                    <AnimatedLoader
                        visible={loading}
                        animationSource={require('@assets/animations/loading.json')}
                    />
                )
            }
            estimatedItemSize={100}
        />
    );

    const renderVisitPlan = () => {
        if (data.length === 0 && !loading) {
            return renderEmptyState();
        }
        return renderContent();
    };

    const updatePendingApproval = async () => {
        setIsConfirmationModalVisible(false);
        const visitPlanUpdateData = {
            visit_plan_id: visitPlanIdsForApproval,
            approval_status: 'Pending'
        };
        try {
            const response = await put('/updateVisitPlan/updateApprovalStatus', visitPlanUpdateData);
            if (response.success) {
                showToast({ type: 'success', message: response.message, title: 'Success' });
                fetchData({ date: formattedDate, employeeId: currentUserId });
            } else {
                showToast({ type: 'error', message: response.message, title: 'Error' });
            }
        } catch (error) {
            console.error('Error updating approval status:', error);
            showToast({ type: 'error', message: 'Failed to update approval status', title: 'Error' });
        }
    };

    return (
        <SafeAreaView>
            <NavigationHeader
                title="Visits Plan"
                logo={false}
                onBackPress={() => navigation.goBack()}
            />
            <Button
                width="40%"
                height={40}
                alignSelf="flex-end"
                marginVertical={0}
                marginBottom={10}
                marginHorizontal={20}
                title="Send for Approval"
                backgroundColor={allPending || visitPlanIdsForApproval.length === 0 ? COLORS.buttonDisabled : COLORS.orange}
                onPress={() => setIsConfirmationModalVisible(true)}
                disabled={allPending || visitPlanIdsForApproval.length === 0}
            />
            <RoundedContainer borderTopLeftRadius={20} borderTopRightRadius={20}>
                <View style={{ marginVertical: 15 }}>
                    <VerticalScrollableCalendar date={date} onChange={newDate => setDate(newDate)} />
                </View>
                {renderVisitPlan()}
            </RoundedContainer>
            <FABButton onPress={() => navigation.navigate('VisitPlanForm')} />
            <RulesModal isVisible={isVisible} onClose={() => setIsVisible(!isVisible)} />
            <ConfirmationModal
                isVisible={isConfirmationModalVisible}
                onCancel={() => setIsConfirmationModalVisible(false)}
                onConfirm={updatePendingApproval}
            />
        </SafeAreaView>
    );
};

export default VisitsPlanScreen;
