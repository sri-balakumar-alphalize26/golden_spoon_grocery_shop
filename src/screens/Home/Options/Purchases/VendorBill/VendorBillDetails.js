import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { RoundedScrollContainer } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { formatDate } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchVendorBillDetails } from '@api/details/detailApi';
import VendorBillDetailList from './VendorBillDetailList';
import { OverlayLoader } from '@components/Loader';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { VendorModal } from '@components/Modal';

const VendorBillDetails = ({ navigation, route }) => {
  const { id: vendorBillId } = route?.params || {};
  const [details, setDetails] = useState({});
  // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // console.log("🚀 ~ submit ~ vendorData:", JSON.stringify(details, null, 2));
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vendorBills, setVendorBills] = useState([]);
  const [isMenuModalVisible, setIsMenuModalVisible] = useState(false);
  const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);

  const fetchDetails = async () => {
    setIsLoading(true);
    try {
      const updatedDetails = await fetchVendorBillDetails(vendorBillId);
      if (updatedDetails && updatedDetails[0]) {
        setDetails(updatedDetails[0]);
        setVendorBills(updatedDetails[0]?.products_lines || []);
      }
    } catch (error) {
      console.error('Error fetching Vendor Bill details:', error);
      showToastMessage('Failed to fetch vendor bill details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (vendorBillId) {
        fetchDetails(vendorBillId);
      }
    }, [vendorBillId])
  );

  const handleRecordPayment = () => {
    navigation.navigate('SupplierPaymentCreation', { id: vendorBillId });
  };

  const handlePdfDownload = () => {
    navigation.navigate('DeliveryNoteCreation', { id: vendorBillId });
  }

  return (
    <SafeAreaView>
      <NavigationHeader
        title={details?.sequence_no || 'Vendor Bill Details'}
        onBackPress={() => navigation.goBack()}
        logo={false}
        iconOneName='menu-fold'
        iconOnePress={() => setIsMenuModalVisible(true)}
      />
      <RoundedScrollContainer>
        <DetailField label="Sequence No" value={details?.sequence_no || '-'} />
        <DetailField
          label="Supplier Name"
          value={details?.supplier?.supplier_name || '-'}
          multiline={true}
        />
        <DetailField label="Ordered Date" value={formatDate(details?.order_date)} />
        <DetailField label="Bill Date" value={formatDate(details?.bill_date)} />
        <DetailField label="Purchase Type" value={details?.purchase_type || '-'} />
        <DetailField label="Sales Person" value={details?.sales_preson?.sales_person_name || '-'} />
        <DetailField label="Warehouse" value={details?.warehouse_name || '-'} />
        <DetailField label="Country" value={details?.country?.country_name || '-'} />
        <DetailField label="Currency" value={details?.currency?.currency_name || '-'} />
        <DetailField label="TRN Number" value={details?.Trn_number?.toString() || '-'} />
        <DetailField label="Payment Status" value={details?.payment_status || '-'} />
        <DetailField label="Payment Method" value={details?.payment_method_name || '-'} />
        <FlatList
          data={vendorBills}
          renderItem={({ item }) => <VendorBillDetailList item={item} />}
          keyExtractor={(item) => item._id}
        />

        <View style={{ marginVertical: 2, marginBottom: 15 }}>
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Sub Total : </Text>
            <Text style={styles.totalValue}>{details.untaxed_total_amount}</Text>
          </View>
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Taxes : </Text>
            <Text style={styles.totalValue}>{((details.total_amount)-(details.untaxed_total_amount)).toFixed(2)}</Text>
          </View>
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total : </Text>
            <Text style={styles.totalValue}>{details.total_amount}</Text>
          </View>
        </View>

        <VendorModal
          isVisible={isMenuModalVisible}
          onCancel={() => setIsMenuModalVisible(false)}
          onOptionSelect={(option) => {
            if (option === 'Record Payment') handleRecordPayment();
            else if (option === 'PDF Download') handlePdfDownload();
          }}
        />
        <OverlayLoader visible={isLoading || isSubmitting} />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  label: {
    marginVertical: 5,
    fontSize: 16,
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  totalSection: {
    flexDirection: 'row',
    marginVertical: 5,
    margin: 10,
    alignSelf: "center",
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  totalValue: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#666666',
  },
});

export default VendorBillDetails;