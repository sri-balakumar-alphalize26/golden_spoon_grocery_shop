import React, { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { OverlayLoader } from '@components/Loader';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { EmptyItem, EmptyState } from '@components/common/empty';
import { NavigationHeader } from '@components/Header';
import { fetchKPIDashboard } from '@api/services/generalApi';
import { useAuthStore } from '@stores/auth';
import KPIList from './KPIList';

const KPIListingScreen = ({ navigation }) => {
    const isFocused = useIsFocused();
    const currentUser = useAuthStore((state) => state.user);
    const currentUserId = currentUser?.related_profile?._id || '';
    const [loading, setLoading] = useState(false);
    const route = useRoute();
    const { kpiCategory } = route.params;
    const [dashBoardDetails, setDashBoardDetails] = useState({
        assignedKpiData: [],
        importantKpiData: [],
        urgentKpiData: [],
        serviceKpiData: [],
        taskManagements: [],
        inProgressKpi: [],
        completedKpi: [],
    });
    
    const fetchKPIDetails = async () => {
        try {
            const data = await fetchKPIDashboard({ userId: currentUserId });
            setDashBoardDetails({
                assignedKpiData: data.assigned_kpi_data || [],
                importantKpiData: data.important_kpi_data || [],
                urgentKpiData: data.urgent_kpi_data || [],
                serviceKpiData: data.service_kpi_data || [],
                taskManagements: data.task_managments || [],
                inProgressKpi: data.in_progress_kpi || [],
                completedKpi: data.completed_kpi || []
            });
        } catch (error) {
            console.error('Error fetching KPI details:', error);
            showToastMessage('Failed to fetch KPI details');
        }
    };    
    
    useEffect(() => {
        if (isFocused) {
            fetchKPIDetails();
        }
    }, [isFocused]);

    const getDataForCategory = () => {
        let data = [];
        switch (kpiCategory) {
            case 'Assigned':
                data = dashBoardDetails.assignedKpiData;
                break;
            case 'Urgent':
                data = dashBoardDetails.urgentKpiData;
                break;
            case 'Important':
                data = dashBoardDetails.importantKpiData;
                break;
            case 'Regular Task':
                data = dashBoardDetails.serviceKpiData;
                break;
            case 'In-Progress':
                data = dashBoardDetails.inProgressKpi;
                break;
            case 'Completed':
                data = dashBoardDetails.completedKpi;
                break;
            default:
                data = [];
                break;
        }
        // console.log("KPI Data for Category :", kpiCategory);
        return data;
    };    

    const kpiData = getDataForCategory();
    const renderItem = ({ item }) => {
        if (item.empty) {
            return <EmptyItem />
        }
        return <KPIList item={item} onPress={() => navigation.navigate('KPIActionDetails', { id: item._id })} />
    }

    const renderEmptyState = () => (
        <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message={'No Task Found'} />
    )

    const renderContent = () => (
        <FlashList
            data={formatData(kpiData, 1)}
            numColumns={1}
            renderItem={renderItem}
            keyExtractor={(item, index) => index.toString()}
            contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
            showsVerticalScrollIndicator={false}
            onEndReachedThreshold={0.2}
            estimatedItemSize={100}
        />
    );
    const renderKPIList = () => {
        // console.log("🚀 ~ kpiData:", JSON.stringify(kpiData, null, 2))
        if (kpiData.length === 0 && !loading) {
            return renderEmptyState();
        }
        return renderContent();
    };

    return (
        <SafeAreaView>
            <NavigationHeader
                title={`${kpiCategory} KPI List`}
                onBackPress={() => navigation.goBack()}
            />
            <RoundedContainer>
                {renderKPIList()}
            </RoundedContainer>
            <OverlayLoader visible={loading} />
        </SafeAreaView>
    );
}
export default KPIListingScreen;