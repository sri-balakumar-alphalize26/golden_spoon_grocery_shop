import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { RoundedScrollContainer } from '@components/containers';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { FABButton } from '@components/common/Button';
import { fetchVehicles } from '@api/services/generalApi';
import { useDataFetching } from '@hooks';
import CalendarScreen from '@components/Calendar/CalendarScreen';
import { vehicleTrackingStyles as styles } from './styles';

const VehicleTrackingScreen = ({ navigation }) => {
  const isFocused = useIsFocused();
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchVehicles);
  const [selectedDate, setSelectedDate] = useState(null);
  const [vehicleEntries, setVehicleEntries] = useState([]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData();
    }
  }, [isFocused]);

  const handleDateSelect = (day) => {
    setSelectedDate(day.dateString);
    // Filter vehicle entries for selected date
    // For now, we'll show empty state since no entries exist
    setVehicleEntries([]);
  };

  const handleAddEntry = () => {
    // Navigate to add vehicle tracking entry form
    navigation.navigate('VehicleTrackingForm');
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Text style={styles.emptyStateText}>No Entries Found</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader
        title="Vehicle Tracking"
        navigation={navigation}
      />
      
      <RoundedScrollContainer style={styles.content}>
        {/* Calendar Section */}
        <View style={styles.calendarContainer}>
          <CalendarScreen
            onDayPress={handleDateSelect}
            style={styles.calendar}
          />
        </View>

        {/* Content Section */}
        <View style={styles.contentContainer}>
          {vehicleEntries.length === 0 ? (
            renderEmptyState()
          ) : (
            // TODO: Render vehicle tracking entries list
            <View>
              {/* Vehicle entries will be rendered here */}
            </View>
          )}
        </View>
      </RoundedScrollContainer>
      
      {/* Floating Action Button */}
      <FABButton onPress={handleAddEntry} />
      
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

export default VehicleTrackingScreen;