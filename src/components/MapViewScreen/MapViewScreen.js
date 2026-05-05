import React from 'react';
import PropTypes from 'prop-types';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { showToastMessage } from '@components/Toast';

const MapViewScreen = ({ route }) => {
    const navigation = useNavigation();

    const { latitude, longitude } = route.params;

    // Validate latitude and longitude
    if (!latitude || !longitude) {
        showToastMessage("Invalid Coordinates", "Latitude or Longitude is missing.");
        navigation.goBack();
        return null;
    }

    return (
        <SafeAreaView>
            <NavigationHeader
                title="Map View"
                onBackPress={() => navigation.goBack()}
            />
            <MapView
                style={styles.map}
                initialRegion={{
                    latitude: parseFloat(latitude),
                    longitude: parseFloat(longitude),
                    latitudeDelta: 0.0922,
                    longitudeDelta: 0.0421,
                }}
            >
                <Marker
                    coordinate={{
                        latitude: parseFloat(latitude),
                        longitude: parseFloat(longitude),
                    }}
                    title="Selected Location"
                />
            </MapView>
        </SafeAreaView>
    );
};

// PropTypes for type checking
MapViewScreen.propTypes = {
    route: PropTypes.shape({
        params: PropTypes.shape({
            latitude: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
            longitude: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        }).isRequired,
    }).isRequired,
};

// Styles object for consistent styling
const styles = StyleSheet.create({
    map: {
        flex: 1,
    },
});

export default MapViewScreen;
