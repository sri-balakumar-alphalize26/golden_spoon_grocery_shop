import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions, Text, Platform, TouchableOpacity } from 'react-native';
import { PieChart } from 'react-native-svg-charts';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { useIsFocused } from '@react-navigation/native';
import { useAuthStore } from '@stores/auth';
import { showToastMessage } from '@components/Toast';
import { fetchKPIDashboard } from '@api/services/generalApi';

const KPIDashboardScreen = ({ navigation }) => {
    const screenWidth = Dimensions.get('window').width;
    const isFocused = useIsFocused();
    const currentUser = useAuthStore((state) => state.user);
    const currentUserId = currentUser?.related_profile?._id || '';
    const [dashBoardDetails, setDashBoardDetails] = useState({
        assignedKpiData: [],
        urgentKpiData: [],
        importantKpiData: [],
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
                urgentKpiData: data.urgent_kpi_data || [],
                importantKpiData: data.important_kpi_data || [],
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

    const randomColor = () => (
        '#' + ((Math.random() * 0xffffff) << 0).toString(16) + '000000'
    ).slice(0, 7);

    const colorMapping = {
        'Assigned': '#d802db',
        'Urgent': '#FFDE43',
        'Important': '#36A2EB',
        'Regular Task': '#4BB543',
        'In-Progress': '#FF6384',
        'Completed': '#4BC0C0',
    };

    const pieData = [
        { name: 'Assigned', value: dashBoardDetails.assignedKpiData.length || 0 },
        { name: 'Urgent', value: dashBoardDetails.urgentKpiData.length || 0 },
        { name: 'Important', value: dashBoardDetails.importantKpiData.length || 0 },
        { name: 'Regular Task', value: dashBoardDetails.serviceKpiData.length || 0 },
        { name: 'In-Progress', value: dashBoardDetails.inProgressKpi.length || 0 },
        { name: 'Completed', value: dashBoardDetails.completedKpi.length || 0 },
    ]
        .map((item, index) => ({
            name: item.name, 
            value: item.value,
            svg: {
                fill: colorMapping[item.name],
                onPress: () => navigation.navigate('KPIListingScreen', { kpiCategory: item.name }),
            },
            key: `pie-${index}`,
        }));

    const PieSection = ({ data, title }) => (
        <View style={styles.chartContainer}>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.divider} />
            <View style={styles.chartLegendContainer}>
                <View style={styles.chartWrapper}>
                    <PieChart
                        style={styles.pieChart}
                        data={data}
                        padAngle={0}

                    />
                </View>
                <View style={styles.legendContainer}>
                    {pieData.map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            style={styles.legendItem}
                            onPress={() => navigation.navigate('KPIListingScreen', { kpiCategory: item.name })} 
                        >
                            <View style={[styles.legendDot, { backgroundColor: item.svg.fill }]} />
                            <Text style={styles.legendLabel}>{`${item.name}: ${item.value}`}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </View>
    );

    return (
        <SafeAreaView>
            <NavigationHeader title="KPI Dashboard" onBackPress={() => navigation.goBack()} />
            <RoundedScrollContainer>
                <PieSection data={pieData} title="Action Screens" />
            </RoundedScrollContainer>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    chartLegendContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    chartWrapper: {
        flex: 1,
    },
    pieChart: {
        height: 200,
        width: '100%',
        marginLeft: -10,
    },
    title: {
        fontSize: 16,
        color: COLORS.themeapp,
        textAlign: 'center',
        fontFamily: FONT_FAMILY.urbanistBlack,
        marginBottom: 10,
    },
    countText: {
        fontSize: 24,
        textAlign: 'center',
        marginBottom: 10,
    },
    divider: {
        borderWidth: 0.5,
        borderColor: '#E8E8E8',
        marginVertical: 10,
    },
    legendContainer: {
        flexDirection: 'column',
        justifyContent: 'center',
        paddingVertical: 10,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 8,
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 15,
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
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 10,
        marginLeft: 10,
    },
    legendLabel: {
        fontSize: 14,
        color: 'black',
        flexShrink: 1,
        fontFamily: FONT_FAMILY.urbanistBold
    },
});

export default KPIDashboardScreen;
