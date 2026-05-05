import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { CheckBox } from '@components/common/CheckBox';
import { LoadingButton } from '@components/common/Button';
import { DropdownSheet } from '@components/common/BottomSheets';
import Text from '@components/Text';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { formatDate, formatDateTime } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchVehicles, fetchVehicleDetails, fetchLocations } from '@api/details/detailApi';
import { post } from '@api/services/utils';
import axios from 'axios';
import { VEHICLE_TRACKING_URL } from '@api/endpoints/endpoints';
import { OverlayLoader } from '@components/Loader';
import { validateFields } from '@utils/validation';


const VehicleTrackingForm = ({ navigation, route }) => {
  console.log('VehicleTrackingForm loaded');
  
  // Get existing trip data from route params (when editing/continuing a trip)
  const existingTripData = route?.params?.tripData;
  const isEditMode = !!existingTripData;
  
  // Determine initial trip state based on existing data
  const getInitialTripState = () => {
    if (!existingTripData) return 'not_started';
    
    if (existingTripData.start_trip && !existingTripData.end_trip && !existingTripData.trip_cancelled) {
      return 'in_progress';
    } else if (existingTripData.end_trip) {
      return 'completed';
    } else if (existingTripData.trip_cancelled) {
      return 'cancelled';
    }
    return 'not_started';
  };

  const initialTripState = getInitialTripState();
  
  const [formData, setFormData] = useState({
    date: existingTripData?.date ? new Date(existingTripData.date) : new Date(),
    vehicle: existingTripData?.vehicle || '',
    driver: existingTripData?.driver || '',
    plateNumber: existingTripData?.plateNumber || '',
    source: existingTripData?.source || '',
    destination: existingTripData?.destination || '',
    estimatedTime: existingTripData?.estimatedTime || '',
    startTrip: existingTripData?.start_trip || false,
    startKM: existingTripData?.startKM || '',
    endTrip: existingTripData?.end_trip || false,
    endKM: existingTripData?.endKM || '0',
    startTime: existingTripData?.startTime ? new Date(existingTripData.startTime) : new Date(),
    endTime: existingTripData?.endTime ? new Date(existingTripData.endTime) : new Date(),
    travelledKM: existingTripData?.travelledKM || '0',
    purposeOfVisit: existingTripData?.purposeOfVisit || '',
    invoiceNumbers: existingTripData?.invoiceNumbers || '',
    amount: existingTripData?.amount || '0',
    vehicleChecklist: {
      coolentWater: existingTripData?.vehicleChecklist?.coolentWater || false,
      oilChecking: existingTripData?.vehicleChecklist?.oilChecking || false,
      tyreChecking: existingTripData?.vehicleChecklist?.tyreChecking || false,
      batteryChecking: existingTripData?.vehicleChecklist?.batteryChecking || false,
      dailyChecks: existingTripData?.vehicleChecklist?.dailyChecks || false,
    },
    cancelTrip: existingTripData?.trip_cancelled || false,
    remarks: existingTripData?.remarks || '',
    imageUri: existingTripData?.imageUri || '',
    // GPS coordinates
    startLatitude: existingTripData?.startLatitude || null,
    startLongitude: existingTripData?.startLongitude || null,
    endLatitude: existingTripData?.endLatitude || null,
    endLongitude: existingTripData?.endLongitude || null,
    // Trip status
    isTripStarted: initialTripState === 'in_progress' || initialTripState === 'completed',
    endTrip: existingTripData?.end_trip || false,
    tripStatus: initialTripState,
  });

  const [dropdowns, setDropdowns] = useState({
    vehicles: [],
    drivers: [],
    sourceLocations: [],
    destinations: [],
    purposeOfVisit: [],
  });

  const [selectedType, setSelectedType] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isStartTimePickerVisible, setIsStartTimePickerVisible] = useState(false);
  const [isEndTimePickerVisible, setIsEndTimePickerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Load dropdown data from API
  useEffect(() => {
    const loadDropdownData = async () => {
      setIsLoading(true);
      try {
        const [vehiclesData, locationsData] = await Promise.all([
          fetchVehicles(),
          fetchLocations()
        ]);

        setDropdowns({
          vehicles: vehiclesData || [],
          sourceLocations: locationsData || [],
          destinations: locationsData || [],
          purposeOfVisit: [
            { _id: '1', name: 'Client Visit' },
            { _id: '2', name: 'Delivery' },
            { _id: '3', name: 'Pickup' },
            { _id: '4', name: 'Maintenance' },
            { _id: '5', name: 'Other' },
          ],
        });
      } catch (error) {
        console.error('Error loading dropdown data:', error);
        showToastMessage('Failed to load data', 'error');
        // Set empty arrays as fallback
        setDropdowns({
          vehicles: [],
          sourceLocations: [],
          destinations: [],
          purposeOfVisit: [
            { _id: '1', name: 'Client Visit' },
            { _id: '2', name: 'Delivery' },
            { _id: '3', name: 'Pickup' },
            { _id: '4', name: 'Maintenance' },
            { _id: '5', name: 'Other' },
          ],
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadDropdownData();
  }, []);

  // Helper functions to determine field states
  const isFieldDisabled = (fieldName) => {
    const { tripStatus, isTripStarted } = formData;
    
    // Trip basic info fields - disabled after trip starts
    const tripBasicFields = ['source', 'destination', 'purposeOfVisit', 'vehicle', 'driver', 'plateNumber'];
    
    // Trip control fields - disabled based on trip status
    const tripControlFields = ['startTrip'];
    
    // Completed trip fields - disabled after trip ends
    const completedTripFields = ['endTrip', 'startKM'];
    
    if (tripStatus === 'completed' || tripStatus === 'cancelled') {
      // All fields disabled except remarks and viewing
      return !['remarks'].includes(fieldName);
    }
    
    if (isTripStarted && tripBasicFields.includes(fieldName)) {
      return true; // Disable trip basic info after start
    }
    
    if (isTripStarted && tripControlFields.includes(fieldName)) {
      return true; // Disable start trip controls
    }
    
    return false;
  };

  const isFieldEditable = (fieldName) => {
    const { tripStatus, isTripStarted } = formData;
    
    // Always editable fields during trip
    const alwaysEditableFields = ['endKM', 'remarks', 'invoiceNumbers', 'imageUri', 'endTime'];
    
    // Editable only when trip is in progress
    const tripProgressFields = ['endTrip'];
    
    if (tripStatus === 'completed' || tripStatus === 'cancelled') {
      return ['remarks'].includes(fieldName); // Only remarks editable after completion
    }
    
    if (isTripStarted) {
      return alwaysEditableFields.includes(fieldName) || tripProgressFields.includes(fieldName);
    }
    
    return true; // All fields editable before trip starts
  };

  const getFieldStyle = (fieldName) => {
    return isFieldDisabled(fieldName) ? styles.disabledInput : {};
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const handleChecklistChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      vehicleChecklist: {
        ...prev.vehicleChecklist,
        [field]: value
      }
    }));
  };

  const handleImagePicker = () => {
    Alert.alert(
      "Select Image",
      "Choose an option",
      [
        { text: "Camera", onPress: openCamera },
        { text: "Gallery", onPress: openGallery },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const openCamera = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1000,
      maxHeight: 1000,
    };

    launchCamera(options, (response) => {
      if (response.didCancel || response.error) {
        showToastMessage('Camera cancelled or error occurred', 'error');
        return;
      }
      
      if (response.assets && response.assets[0]) {
        const imageUri = response.assets[0].uri;
        handleInputChange('imageUri', imageUri);
        showToastMessage('Image captured successfully!', 'success');
      }
    });
  };

  const openGallery = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1000,
      maxHeight: 1000,
    };

    launchImageLibrary(options, (response) => {
      if (response.didCancel || response.error) {
        showToastMessage('Gallery selection cancelled or error occurred', 'error');
        return;
      }
      
      if (response.assets && response.assets[0]) {
        const imageUri = response.assets[0].uri;
        handleInputChange('imageUri', imageUri);
        showToastMessage('Image selected successfully!', 'success');
      }
    });
  };

  const handleDropdownSelect = async (field, item) => {
    handleInputChange(field, item.name);
    
    // Auto-populate driver and plate number when vehicle is selected
    if (field === 'vehicle') {
      try {
        setIsLoading(true);
        const vehicleDetails = await fetchVehicleDetails(item._id);
        if (vehicleDetails) {
          handleInputChange('driver', vehicleDetails.driver_name || vehicleDetails.driver || '');
          handleInputChange('plateNumber', vehicleDetails.plate_number || vehicleDetails.plateNumber || '');
        }
      } catch (error) {
        console.error('Error fetching vehicle details:', error);
        // Fallback to local data if API fails
        const selectedVehicle = dropdowns.vehicles.find(v => v.name === item.name);
        if (selectedVehicle) {
          handleInputChange('driver', selectedVehicle.driver || '');
          handleInputChange('plateNumber', selectedVehicle.plate_number || '');
        }
      } finally {
        setIsLoading(false);
      }
    }
    
    setIsVisible(false);
  };

  const openDropdown = (type, data) => {
    setSelectedType({ type, data });
    setIsVisible(true);
  };

  const calculateTravelledKM = () => {
    const start = parseFloat(formData.startKM) || 0;
    const end = parseFloat(formData.endKM) || 0;
    const travelled = Math.max(0, end - start);
    handleInputChange('travelledKM', travelled.toString());
  };

  useEffect(() => {
    calculateTravelledKM();
  }, [formData.startKM, formData.endKM]);

  const validateForm = () => {
    const { tripStatus, isTripStarted, endTrip } = formData;
    
    const requiredFields = [
      'date',
      'vehicle',
      'driver',
      'plateNumber',
    ];

    let newErrors = validateFields(formData, requiredFields);

    // Additional validation when Start Trip is checked (for new trips)
    if (formData.startTrip && !isTripStarted) {
      if (!formData.source) {
        newErrors.source = 'Source location is required when starting a trip';
      }
      if (!formData.destination) {
        newErrors.destination = 'Destination is required when starting a trip';
      }
      if (!formData.purposeOfVisit) {
        newErrors.purposeOfVisit = 'Purpose of visit is required when starting a trip';
      }
    }

    // Additional validation when End Trip is checked
    if (endTrip && isTripStarted) {
      if (!formData.endKM || formData.endKM === '0') {
        newErrors.endKM = 'End KM reading is required to end the trip';
      }
      
      const startKM = parseFloat(formData.startKM) || 0;
      const endKM = parseFloat(formData.endKM) || 0;
      
      if (endKM <= startKM) {
        newErrors.endKM = 'End KM must be greater than Start KM';
      }
    }

    // Validation for trip in edit mode
    if (isEditMode && isTripStarted && !endTrip) {
      // For ongoing trips, only validate editable fields
      if (!formData.endKM || formData.endKM === '0') {
        // End KM not required until ending trip, but show warning
        console.log('End KM should be updated during the trip');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Function to get current GPS location
  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
          (error) => {
            console.error('GPS Error:', error);
            // Return mock coordinates if GPS fails
            resolve({
              latitude: 25.2048, // Dubai coordinates as fallback
              longitude: 55.2708,
            });
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000,
          }
        );
      } else {
        // Fallback coordinates
        resolve({
          latitude: 25.2048,
          longitude: 55.2708,
        });
      }
    });
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      showToastMessage('Please fill all required fields', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      let submitData = {
        ...formData,
        date: formatDate(formData.date),
        startTime: formatDateTime(formData.startTime),
        endTime: formatDateTime(formData.endTime),
      };

      // Add trip ID if editing existing trip
      if (isEditMode && existingTripData?.id) {
        submitData.tripId = existingTripData.id;
        submitData.isUpdate = true;
      }

      // If Start Trip is checked (for new trips only)
      if (formData.startTrip && !formData.isTripStarted) {
        try {
          showToastMessage('Capturing GPS location...', 'info');
          const location = await getCurrentLocation();
          submitData = {
            ...submitData,
            start_trip: true,
            startLatitude: location.latitude,
            startLongitude: location.longitude,
            isTripStarted: true,
            tripStatus: 'in_progress',
          };
          showToastMessage(`GPS captured: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`, 'success');
        } catch (error) {
          console.error('Failed to capture GPS:', error);
          showToastMessage('GPS capture failed, using default location', 'warning');
        }
      }

      // If End Trip is checked, capture end GPS coordinates
      if (formData.endTrip && formData.isTripStarted) {
        try {
          showToastMessage('Capturing end location...', 'info');
          const location = await getCurrentLocation();
          submitData = {
            ...submitData,
            end_trip: true,
            endLatitude: location.latitude,
            endLongitude: location.longitude,
            tripStatus: 'completed',
          };
          showToastMessage(`End location captured: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`, 'success');
        } catch (error) {
          console.error('Failed to capture end GPS:', error);
          showToastMessage('End GPS capture failed, using default location', 'warning');
        }
      }

      // Use the same POST method as PurchaseOrderForm
      let response;
      if (isEditMode && existingTripData?.id) {
        response = await ('/updateVehicleTracking', submitData);
      } else {
        response = await post('/createVehicleTracking', submitData);
      }

      // Update form state if trip was started
      if (formData.startTrip && !formData.isTripStarted) {
        setFormData(prev => ({
          ...prev,
          isTripStarted: true,
          startLatitude: submitData.startLatitude,
          startLongitude: submitData.startLongitude,
          tripStatus: 'in_progress',
        }));
        showToastMessage('Trip started successfully!', 'success');
        setTimeout(() => navigation.goBack(), 1500);
      } else if (formData.endTrip && formData.isTripStarted) {
        setFormData(prev => ({
          ...prev,
          endLatitude: submitData.endLatitude,
          endLongitude: submitData.endLongitude,
          tripStatus: 'completed',
        }));
        showToastMessage('Trip completed successfully!', 'success');
        setTimeout(() => navigation.goBack(), 2000);
      } else {
        showToastMessage('Vehicle tracking entry added successfully', 'success');
        navigation.goBack();
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      showToastMessage('Failed to add vehicle tracking entry', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelTrip = async () => {
    Alert.alert(
      'Cancel Trip',
      'Are you sure you want to cancel this trip? This action cannot be undone.',
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSubmitting(true);
              
              // Capture current location for cancellation record
              let cancelData = {
                ...formData,
                trip_cancelled: true,
                tripStatus: 'cancelled',
                date: formatDate(formData.date),
                startTime: formatDateTime(formData.startTime),
                endTime: formatDateTime(formData.endTime),
              };

              try {
                const location = await getCurrentLocation();
                cancelData.cancelLatitude = location.latitude;
                cancelData.cancelLongitude = location.longitude;
              } catch (error) {
                console.error('Failed to capture cancel location:', error);
              }

              // Use update API for cancelling existing trip
              let response;
              if (isEditMode && existingTripData?.id) {
                response = await updateVehicleTracking(existingTripData.id, cancelData);
              } else {
                response = await submitVehicleTracking(cancelData);
              }
              
              setFormData(prev => ({
                ...prev,
                tripStatus: 'cancelled',
              }));
              
              showToastMessage('Trip cancelled successfully', 'success');
              setTimeout(() => navigation.goBack(), 2000);
              
            } catch (error) {
              console.error('Error cancelling trip:', error);
              showToastMessage('Failed to cancel trip', 'error');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader
        title={
          isEditMode 
            ? formData.tripStatus === 'in_progress' 
              ? "Continue Trip" 
              : formData.tripStatus === 'completed'
              ? "View Completed Trip"
              : formData.tripStatus === 'cancelled'
              ? "View Cancelled Trip"
              : "Edit Vehicle Tracking"
            : "New Vehicle Tracking"
        }
        navigation={navigation}
      />
      
      <RoundedScrollContainer>
        {/* Trip Status Indicator */}
        {isEditMode && (
          <View style={styles.tripStatusIndicator}>
            <Text style={styles.tripStatusTitle}>
              Trip Status: 
              <Text style={[
                styles.tripStatusValue,
                formData.tripStatus === 'in_progress' && styles.tripStatusInProgress,
                formData.tripStatus === 'completed' && styles.tripStatusCompleted,
                formData.tripStatus === 'cancelled' && styles.tripStatusCancelled,
              ]}>
                {formData.tripStatus === 'in_progress' ? ' IN PROGRESS' :
                 formData.tripStatus === 'completed' ? ' COMPLETED' :
                 formData.tripStatus === 'cancelled' ? ' CANCELLED' : ' UNKNOWN'}
              </Text>
            </Text>
            {formData.isTripStarted && formData.startLatitude && (
              <Text style={styles.tripStatusDetails}>
                Started at: {formData.startLatitude.toFixed(6)}, {formData.startLongitude.toFixed(6)}
              </Text>
            )}
          </View>
        )}

        {/* Date */}
        <FormInput
          label="Date :"
          value={formatDate(formData.date)}
          onPress={() => setIsDatePickerVisible(true)}
          error={errors.date}
          required
          editable={false}
        />

        {/* Vehicle */}
        <FormInput
          label="Vehicle :"
          value={formData.vehicle}
          onPress={() => openDropdown('vehicle', dropdowns.vehicles)}
          error={errors.vehicle}
          dropIcon="chevron-down"
          required
        />

        {/* Driver - Auto-filled when vehicle is selected */}
        <FormInput
          label="Driver :"
          value={formData.driver}
          onChangeText={(value) => handleInputChange('driver', value)}
          error={errors.driver}
          placeholder="Select vehicle to auto-fill"
          editable={false}
          style={{ backgroundColor: '#f5f5f5' }}
          required
        />

        {/* Plate Number - Auto-filled when vehicle is selected */}
        <FormInput
          label="Plate Number:"
          value={formData.plateNumber}
          onChangeText={(value) => handleInputChange('plateNumber', value)}
          error={errors.plateNumber}
          placeholder="Select vehicle to auto-fill"
          editable={false}
          style={{ backgroundColor: '#f5f5f5' }}
          required
        />

        {/* Source */}
        <FormInput
          label="Source:"
          value={formData.source}
          onPress={isFieldDisabled('source') ? null : () => openDropdown('source', dropdowns.sourceLocations)}
          error={errors.source}
          dropIcon="chevron-down"
          required
          style={getFieldStyle('source')}
        />

        {/* Destination */}
        <FormInput
          label="Destination:"
          value={formData.destination}
          onPress={isFieldDisabled('destination') ? null : () => openDropdown('destination', dropdowns.destinations)}
          error={errors.destination}
          dropIcon="chevron-down"
          required
          style={getFieldStyle('destination')}
        />

        {/* Estimated Time */}
        <FormInput
          label="Estimated Time:"
          value={formData.estimatedTime}
          onChangeText={(value) => handleInputChange('estimatedTime', value)}
          placeholder="Estimated time"
        />

        {/* Start Trip */}
        <View style={styles.checkboxContainer}>
          <CheckBox
            label={formData.isTripStarted ? "Trip Started ✓" : "Start Trip"}
            checked={formData.startTrip}
            onPress={formData.isTripStarted ? null : (value) => handleInputChange('startTrip', value)}
          />
          {formData.isTripStarted && (
            <Text style={styles.tripStatusText}>
              Trip started - Location captured
            </Text>
          )}
        </View>

        {/* End Trip - Only show when trip is started */}
        {formData.isTripStarted && formData.tripStatus !== 'completed' && (
          <View style={styles.checkboxContainer}>
            <CheckBox
              label="End Trip"
              checked={formData.endTrip}
              onPress={(value) => handleInputChange('endTrip', value)}
            />
            {formData.endTrip && (
              <Text style={styles.tripStatusText}>
                End trip and capture final location
              </Text>
            )}
          </View>
        )}

        {/* Trip Actions - Only show when trip is started */}
        {formData.isTripStarted && formData.tripStatus !== 'completed' && (
          <View style={styles.tripActionsContainer}>
            <Pressable
              style={[styles.actionButton, styles.cancelButton]}
              onPress={handleCancelTrip}
            >
              <Text style={styles.cancelButtonText}>Cancel Trip</Text>
            </Pressable>
          </View>
        )}

        {/* Start KM */}
        <FormInput
          label="Start KM :"
          value={formData.startKM}
          onChangeText={(value) => handleInputChange('startKM', value)}
          placeholder="Start KM"
          keyboardType="numeric"
        />

        {/* End Trip */}
        <View style={styles.checkboxContainer}>
          <CheckBox
            label="End Trip"
            checked={formData.endTrip}
            onPress={(value) => handleInputChange('endTrip', value)}
          />
        </View>

        {/* End KM */}
        <FormInput
          label="End KM :"
          value={formData.endKM}
          onChangeText={(value) => handleInputChange('endKM', value)}
          keyboardType="numeric"
        />

        {/* Start Time */}
        <FormInput
          label="Start Time :"
          value={formatDateTime(formData.startTime)}
          onPress={() => setIsStartTimePickerVisible(true)}
          editable={false}
        />

        {/* End Time */}
        <FormInput
          label="End Time :"
          value={formatDateTime(formData.endTime)}
          onPress={() => setIsEndTimePickerVisible(true)}
          editable={false}
        />

        {/* Travelled KM */}
        <FormInput
          label="Travelled KM :"
          value={formData.travelledKM}
          editable={false}
          style={styles.readOnlyInput}
        />

        {/* Purpose of Visit */}
        <FormInput
          label="Purpose of visit :"
          value={formData.purposeOfVisit}
          onPress={isFieldDisabled('purposeOfVisit') ? null : () => openDropdown('purposeOfVisit', dropdowns.purposeOfVisit)}
          dropIcon="chevron-down"
          style={getFieldStyle('purposeOfVisit')}
        />

        {/* Invoice Numbers with QR Scanner */}
        <View style={styles.inputWithIconContainer}>
          <View style={styles.inputWrapper}>
            <FormInput
              label="Invoice Numbers :"
              value={formData.invoiceNumbers}
              onChangeText={(value) => handleInputChange('invoiceNumbers', value)}
              placeholder="Invoice numbers"
            />
          </View>
            {/* QR Scanner button removed */}
        </View>

        {/* Amount */}
        <FormInput
          label="Amount :"
          value={formData.amount}
          onChangeText={(value) => handleInputChange('amount', value)}
          keyboardType="numeric"
        />

        {/* Vehicle Checklist */}
        <Text style={styles.sectionTitle}>Vehicle Checklist :</Text>
        <View style={styles.checklistContainer}>
          <CheckBox
            label="Coolent Water"
            checked={formData.vehicleChecklist.coolentWater}
            onPress={(value) => handleChecklistChange('coolentWater', value)}
          />
          <CheckBox
            label="Oil checking"
            checked={formData.vehicleChecklist.oilChecking}
            onPress={(value) => handleChecklistChange('oilChecking', value)}
          />
          <CheckBox
            label="Tyre checking"
            checked={formData.vehicleChecklist.tyreChecking}
            onPress={(value) => handleChecklistChange('tyreChecking', value)}
          />
          <CheckBox
            label="Battery checking"
            checked={formData.vehicleChecklist.batteryChecking}
            onPress={(value) => handleChecklistChange('batteryChecking', value)}
          />
          <CheckBox
            label="Daily Checks"
            checked={formData.vehicleChecklist.dailyChecks}
            onPress={(value) => handleChecklistChange('dailyChecks', value)}
          />
        </View>

        {/* Cancel Trip */}
        <View style={styles.checkboxContainer}>
          <CheckBox
            label="Cancel Trip"
            checked={formData.cancelTrip}
            onPress={(value) => handleInputChange('cancelTrip', value)}
          />
        </View>

        {/* Remarks */}
        <FormInput
          label="Remarks :"
          value={formData.remarks}
          onChangeText={(value) => handleInputChange('remarks', value)}
          placeholder="Enter remarks"
          multiline
          numberOfLines={4}
          style={styles.remarksInput}
        />

        {/* Image Upload Button */}
        <View style={styles.imageUploadContainer}>
          <Pressable style={[
            styles.imagePickerButton,
            formData.imageUri && styles.imagePickerButtonSelected
          ]} onPress={handleImagePicker}>
            <Text style={styles.imagePickerIcon}>
              {formData.imageUri ? '✓' : '📷'}
            </Text>
            <Text style={styles.imagePickerText}>
              {formData.imageUri ? '✓' : '+'}
            </Text>
          </Pressable>
          {formData.imageUri && (
            <Text style={styles.imageSelectedText}>Image selected</Text>
          )}
        </View>

        {/* Submit Button */}
        <LoadingButton
          title={
            formData.endTrip && formData.isTripStarted 
              ? "End Trip" 
              : formData.startTrip && !formData.isTripStarted
              ? "Start Trip"
              : isEditMode && formData.isTripStarted
              ? "Update Trip"
              : "Submit"
          }
          onPress={handleSubmit}
          loading={isSubmitting}
          style={styles.submitButton}
        />
      </RoundedScrollContainer>

      {/* Date Picker */}
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={(date) => {
          handleInputChange('date', date);
          setIsDatePickerVisible(false);
        }}
        onCancel={() => setIsDatePickerVisible(false)}
      />

      {/* Start Time Picker */}
      <DateTimePickerModal
        isVisible={isStartTimePickerVisible}
        mode="datetime"
        onConfirm={(time) => {
          handleInputChange('startTime', time);
          setIsStartTimePickerVisible(false);
        }}
        onCancel={() => setIsStartTimePickerVisible(false)}
      />

      {/* End Time Picker */}
      <DateTimePickerModal
        isVisible={isEndTimePickerVisible}
        mode="datetime"
        onConfirm={(time) => {
          handleInputChange('endTime', time);
          setIsEndTimePickerVisible(false);
        }}
        onCancel={() => setIsEndTimePickerVisible(false)}
      />

      {/* Dropdown Modal */}
      <DropdownSheet
        visible={isVisible}
        data={selectedType?.data || []}
        onSelect={(item) => handleDropdownSelect(selectedType?.type, item)}
        onCancel={() => setIsVisible(false)}
      />

      <OverlayLoader visible={isLoading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.primaryThemeColor,
    marginTop: 20,
    marginBottom: 10,
  },
  checkboxContainer: {
    marginVertical: 5,
  },
  checklistContainer: {
    backgroundColor: COLORS.lightGray,
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border || '#E0E0E0',
  },
  readOnlyInput: {
    backgroundColor: COLORS.lightGray,
  },
  remarksInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    marginTop: 30,
  },
  imageUploadContainer: {
    marginVertical: 15,
    alignItems: 'flex-start',
  },
  imagePickerButton: {
    width: 80,
    height: 80,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  imagePickerButtonSelected: {
    backgroundColor: '#2E7D32',
  },
  imageSelectedText: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  imagePickerIcon: {
    fontSize: 24,
    color: 'white',
    position: 'absolute',
    top: 8,
    right: 8,
  },
  imagePickerText: {
    fontSize: 32,
    color: 'white',
    fontWeight: 'bold',
  },
  inputWithIconContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 15,
  },
  inputWrapper: {
    flex: 1,
    marginRight: 10,
  },
  qrIconButton: {
    width: 50,
    height: 50,
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  qrIcon: {
    fontSize: 24,
    color: 'white',
  },
  tripStatusText: {
    fontSize: 12,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: 5,
    fontStyle: 'italic',
  },
  disabledInput: {
    backgroundColor: COLORS.lightGray,
    opacity: 0.6,
  },
  tripActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 15,
    paddingHorizontal: 20,
  },
  actionButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.red || '#FF6B6B',
    borderWidth: 1,
    borderColor: COLORS.red || '#FF6B6B',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  tripStatusIndicator: {
    backgroundColor: COLORS.lightGray || '#F5F5F5',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primaryThemeColor,
  },
  tripStatusTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: COLORS.black,
    marginBottom: 5,
  },
  tripStatusValue: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  tripStatusInProgress: {
    color: COLORS.primaryThemeColor || '#007AFF',
  },
  tripStatusCompleted: {
    color: COLORS.green || '#28A745',
  },
  tripStatusCancelled: {
    color: COLORS.red || '#DC3545',
  },
  tripStatusDetails: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.gray || '#666666',
    marginTop: 2,
  },
});

export default VehicleTrackingForm;