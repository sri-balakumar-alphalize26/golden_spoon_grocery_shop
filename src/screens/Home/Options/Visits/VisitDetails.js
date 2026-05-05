import React, { useCallback, useState } from 'react';
import { Image, TouchableOpacity } from 'react-native';
import { RoundedScrollContainer, SafeAreaView, UploadsContainer } from '@components/containers';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationHeader } from '@components/Header';
import { DetailField } from '@components/common/Detail';
import { COLORS } from '@constants/theme';
import { formatDateTime } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchCustomerVisitDetails } from '@api/details/detailApi';

const VisitDetails = ({ navigation, route }) => {
  const initialDetails = route?.params?.visitDetails;
  const [details, setDetails] = useState(initialDetails);

  const fetchDetails = async () => {
    try {
      const updatedDetails = await fetchCustomerVisitDetails(initialDetails._id);
      setDetails(updatedDetails[0]);
    } catch (error) {
      console.error('Error fetching visit details:', error);
      showToastMessage('Failed to fetch visit details');
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDetails();
    }, [initialDetails._id])
  );

  const customerContacts = details?.customer_contact?.map(contact => ({
    name: contact.contact_name,
    no: contact.contact_number,
  })) || [];

  const contactNames = customerContacts.map(contact => contact.name).join(', ');
  const contactNo = customerContacts.map(contact => contact.no).join(', ');

  const visitPurposes = details?.purpose_of_visit?.map(visit => visit.name).join(', ');

  const handleMapIconPress = () => {
    if (details?.longitude && details?.latitude) {
      navigation.navigate('MapViewScreen', { latitude: details.latitude, longitude: details.longitude });
    } else {
      showToastMessage('The visit does not have location details');
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Customer Visits Details"
        onBackPress={() => navigation.goBack()}
        // iconOneName="edit"
        // iconOnePress={() => navigation.navigate('EditVisit', { details })}
        logo={false}
      />
      <RoundedScrollContainer>
        <TouchableOpacity onPress={handleMapIconPress} activeOpacity={0.7}>
          <Image
            style={{ alignSelf: 'flex-end', height: 35, width: 30, tintColor: COLORS.orange, marginBottom: 15 }}
            source={require('@assets/icons/common/map_icon.png')}
          />
        </TouchableOpacity>
        <DetailField label="Date & Time" value={formatDateTime(details.date_time)} />
        <DetailField label="Employee Name" value={details?.employee?.name?.trim()} multiline />
        <DetailField label="Customer Name" value={details?.customer?.name?.trim()} multiline />
        <DetailField label="Site / Location" value={details?.site_location?.site_location_name} />
        <DetailField label="Contact Person" value={contactNames || '-'} />
        <DetailField label="Contact No" value={contactNo || '-'} />
        <DetailField label="Next Customer Visit" value={formatDateTime(details.next_customer_visit_date)} />
        <DetailField label="Visit Purpose" value={visitPurposes || '-'} />
        <DetailField label="Time In" value={formatDateTime(details.time_in)} />
        <DetailField label="Time Out" value={formatDateTime(details.time_out)} />
        <DetailField label="Remarks" value={details?.remarks || '-'} multiline numberOfLines={5} textAlignVertical={'top'} />
        {details.images?.length > 0 && (
          <UploadsContainer imageUrls={details.images} title='Attached Images' deleteIcon={false} />
        )}
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default VisitDetails;
