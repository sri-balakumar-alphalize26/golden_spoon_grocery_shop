import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, FlatList, View, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { RoundedScrollContainer } from '@components/containers';
import { DetailField } from '@components/common/Detail';
import { OverlayLoader } from '@components/Loader';
import { Button } from '@components/common/Button';
import SparePartsList from './SparePartsList';
import { formatDateTime } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchServiceDetails } from '@api/details/detailApi';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { post, put } from '@api/services/utils';
import { useAuthStore } from '@stores/auth';
import { showToast } from '@utils/common';
import { TextInput as FormInput } from '@components/common/TextInput';
import { TitleWithButton } from '@components/Header';

const QuickServiceUpdateDetails = ({ route, navigation }) => {
  const { id } = route.params || {};
  const currentUser = useAuthStore((state) => state.user);
  const [details, setDetails] = useState({});
  console.log("🚀 ~ file: ~ Details :", JSON.stringify(details, null, 2))
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sparePartsItems, setSparePartsItems] = useState([]);
  console.log("🚀 ~ file: ~ Spare Parts Items :", JSON.stringify(sparePartsItems, null, 2))
  const [subTotal, setSubTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [calculatedTax, setCalculatedTax] = useState(0);

  const [formData, setFormData] = useState({
    serviceCharge: 100,
    spareTotalPrice: null,
    subTotal: subTotal,
    total: total,
  });

  const addSpareParts = (addedItems) => {
    const structureSpareItems = {
      product_id: addedItems?.product.id,
      product_name: addedItems?.product.label,
      description: addedItems?.description,
      quantity: addedItems?.quantity,
      uom_id: addedItems?.uom?.id,
      uom: addedItems?.uom.label,
      unit_price: addedItems.unitPrice,
      unit_cost: addedItems.unitPrice,
      tax_type_id: addedItems?.taxType?.id,
      tax_type_name: addedItems?.taxType?.label,
      tax: addedItems?.tax,
      spareTotalPrice: addedItems?.spareTotalPrice,
      total: addedItems?.total,
    }
    setSparePartsItems(prevItems => [...prevItems, structureSpareItems]);
  };

  const calculateTotals = () => {
    let calculatedSparePartsTotal = sparePartsItems.reduce(
    (sum, item) => sum + (parseFloat(item.unit_price || 0) * (item.quantity || 1)), 0);
    setSubTotal(calculatedSparePartsTotal);

    let accumulatedSparePartsTax = sparePartsItems.reduce((sum, item) => {
      if (item.tax_type_name === "vat 5%") {
        return sum + (parseFloat(item.unit_price || 0) * 0.05 * (item.quantity || 1));
      }
      return sum;
    }, 0);
  
    const serviceCharge = parseFloat(formData.serviceCharge) || 0;
    const serviceChargeTax = serviceCharge * 0.05;
  
    const totalTax = accumulatedSparePartsTax + serviceChargeTax;
    setCalculatedTax(totalTax);
  
    const total = calculatedSparePartsTotal + serviceCharge + totalTax;
    setTotal(total);

    setFormData((prevFormData) => ({
      ...prevFormData,
      serviceChargeTax,
      spareTotalPrice: calculatedSparePartsTotal,
      subTotal: calculatedSparePartsTotal,
      total,
      totalTax: accumulatedSparePartsTax,
    }));
  };
  
  useEffect(() => {
    calculateTotals();
  }, [sparePartsItems]);
  
  const fetchDetails = async () => {
    setIsLoading(true);
    try {
      const [updatedDetails] = await fetchServiceDetails(id);
      setDetails(updatedDetails || {});
      const jobDiagnosisParts = updatedDetails?.job_diagnoses?.flatMap(diagnosis =>
        diagnosis.job_diagnosis_parts?.map(part => {
          // Destructure the part object to exclude spare_parts_line_lists and product_lists
          const { spare_parts_line_lists, product_lists, ...cleanPart } = part;
          return cleanPart;
        }) || []
      ) || [];
      setSparePartsItems(prevItems => {
        const existingPartIds = new Set(prevItems.map(item => item._id));
        const newItems = jobDiagnosisParts.filter(item => !existingPartIds.has(item._id));
        return [...prevItems, ...newItems];
      });
    } catch (error) {
      console.error('Error fetching service details:', error);
      showToastMessage('Failed to fetch service details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (id) {
        fetchDetails(id);
      }
    }, [id])
  );

  const handleJobApproveQuote = async (approveJobs) => {
    const requestPayload = {
      job_registration_id: id,
      date: new Date(),
      status: 'waiting for parts',
      created_by: currentUser?.related_profile?._id,
      created_by_name: currentUser?.related_profile?.name ?? '',
      assigned_to: details?.assignee_id ?? '',
      assigned_to_name: details?.assignee_name ?? null,
      warehouse_id: currentUser?.warehouse?.warehouse_id,
      warehouse_name: currentUser?.warehouse?.warehouse_name,
      job_diagnosis_ids: [{
        job_diagnosis_id: approveJobs.job_diagnosis_parts_result?.[0]?.job_diagnosis_id,
        job_diagnosis_parts: approveJobs.job_diagnosis_parts_result
      }],
      sales_person_id: currentUser?.related_profile?._id,
      sales_person_name: currentUser?.related_profile?.name,
    }
    
    try {
      const response = await post("/createJobApproveQuote", requestPayload);
      if (response.success === 'true') {
        showToast({
          type: "success",
          title: "Success",
          message: response.message,
        });
        navigation.navigate("QuickServiceScreen");
      } else {
        showToast({
          type: "error",
          title: "ERROR",
          message: response.message,
        });
      }
    } catch (error) {
      console.error("Error Job Approving failed:", error);
      showToast({
        type: "error",
        title: "ERROR",
        message: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const requestPayload = {
      _id: id,
      job_stage: 'Waiting for spare',
      create_job_diagnosis: [
        {
          job_registration_id: id,
          proposed_action_id: null,
          proposed_action_name: null,
          done_by_id: currentUser?.related_profile?._id || null,
          done_by_name: currentUser?.related_profile?.name || '',
          untaxed_total_amount: parseInt(formData.spareTotalPrice, 0),
          parts_or_service_required: null,
          service_type: null,
          service_charge: parseInt(formData.serviceCharge, 0),
          total_amount: parseInt(formData.total, 0),
          parts: sparePartsItems.map((items) => ({
            product_id: items?.product_id,
            product_name: items?.product_name,
            description: items?.description,
            uom_id: items?.uom_id,
            uom: items?.uom,
            quantity: items?.quantity,
            unit_price: items.unit_price,
            sub_total: items.unit_price,
            unit_cost: items?.unit_price,
            // total: items?.total,
            tax_type_id: items?.tax_type_id,
            tax_type_name: items?.tax_type_name,
          }))
        }
      ]
    }
    try {
      const response = await put("/updateJobRegistration", requestPayload);
      if (response.success === 'true') {
        handleJobApproveQuote(response);
        showToast({
          type: "success",
          title: "Success",
          message: response.message || "Spare Parts Request updated successfully",
        });
        navigation.navigate("QuickServiceScreen");
      } else {
        console.error("Submit Failed:", response.message);
        showToast({
          type: "error",
          title: "ERROR",
          message: response.message || "Spare Parts Request update failed",
        });
      }
    } catch (error) {
      console.error("Error Submitting Spare Parts Request:", error);
      showToast({
        type: "error",
        title: "ERROR",
        message: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <NavigationHeader
        title="Update Service Details"
        onBackPress={() => navigation.goBack()}
        logo={false}
      />
      <RoundedScrollContainer>
        <DetailField
          label="Customer"
          value={details?.customer_name?.trim() || '-'}
          multiline
          numberOfLines={3}
          textAlignVertical={'top'}
        />
        <DetailField label="Mobile Number" value={details?.customer_mobile || '-'} />
        <DetailField label="Email" value={details?.customer_email || '-'} />
        <DetailField label="Warehouse Name" value={details?.warehouse_name || '-'} />
        <DetailField label="Created On" value={formatDateTime(details.date)} />
        <DetailField label="Created By" value={details?.assignee_name || '-'} />
        <DetailField label="Brand Name" value={details?.brand_name || '-'} />
        <DetailField label="Device Name" value={details?.device_name || '-'} />
        <DetailField label="Consumer Model" value={details?.consumer_model_name || '-'} />
        <DetailField label="Serial Number" value={details?.serial_no || '-'} />
        <FormInput
          label="Service Charge"
          placeholder="Enter Service Charge"
          keyboardType="numeric"
          value={formData.serviceCharge.toString()}
          onChangeText={(value) => setFormData({ ...formData, serviceCharge: value })}
        />
        <TitleWithButton
          label="Add an item"
          onPress={() => navigation.navigate('AddSpareParts', { id, addSpareParts })}
        />
        <FlatList
          data={sparePartsItems}
          renderItem={({ item }) => (
            <SparePartsList item={item} />
          )}
          keyExtractor={(item, index) => index.toString()}
        />
        {sparePartsItems.length > 0 && <>
        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Sub Total : </Text>
          <Text style={styles.totalValue}>{subTotal.toFixed(2)}</Text>
        </View>
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Tax : </Text>
            <Text style={styles.totalValue}>{calculatedTax.toFixed(2)}</Text>
          </View>
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total : </Text>
            <Text style={styles.totalValue}>{total.toFixed(2)}</Text>
          </View>
        </>
        }
        <Button
          title={'SUBMIT'}
          alignSelf={'center'}
          backgroundColor={COLORS.orange}
          onPress={handleSubmit}
        />

      </RoundedScrollContainer>
      <OverlayLoader visible={isLoading || isSubmitting} />
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

export default QuickServiceUpdateDetails;