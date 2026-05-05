import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { COLORS } from '@constants/theme';
import { vehicleListStyles as styles } from './styles';

const VehicleList = ({ item, onPress, isSelected }) => {
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return COLORS.green;
      case 'inactive':
        return COLORS.red;
      default:
        return COLORS.gray;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress(item)}
      style={[
        styles.vehicleItem,
        isSelected && styles.selectedVehicleItem
      ]}
    >
      <View style={styles.vehicleInfo}>
        <Text style={styles.vehicleName}>
          {item?.name || item?.vehicle_name || item?.vehicleName || 'Unknown Vehicle'}
        </Text>
        <Text style={styles.driverName}>
          Driver: {item?.driver || item?.driver_name || item?.driverName || 'N/A'}
        </Text>
        <View style={styles.statusContainer}>
          <View style={[
            styles.statusDot,
            { backgroundColor: getStatusColor(item?.status) }
          ]} />
          <Text style={styles.statusText}>{item?.status || 'Unknown'}</Text>
          <Text style={styles.lastUpdate}>
            • {item?.lastUpdate || item?.last_update || item?.updatedAt || 'No data'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default VehicleList;