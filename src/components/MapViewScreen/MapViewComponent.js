import React from 'react';
import PropTypes from 'prop-types';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { showToastMessage } from '@components/Toast';

const MapViewComponent = ({ longitude, latitude }) => {
      // Validate latitude and longitude
      if (!latitude || !longitude) {
        showToastMessage("Invalid Coordinates Latitude or Longitude is missing.");
        return null;
    }
    return (
            <MapView
                style={styles.map}
                initialRegion={{
                    latitude: latitude || 0,
                    longitude: longitude || 0,
                    latitudeDelta: 0.0922,
                    longitudeDelta: 0.0421,
                }}
            >
                {latitude && longitude && (
                    <Marker
                        coordinate={{ latitude, longitude }}
                        title="Selected Location"
                    />
                )}
            </MapView>
    );
};

MapViewComponent.propTypes = {
    latitude: PropTypes.number,
    longitude: PropTypes.number,
};

const styles = StyleSheet.create({
    map: {
        flex: 1,
    },
});

export default MapViewComponent;
