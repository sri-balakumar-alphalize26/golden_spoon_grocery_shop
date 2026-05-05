import * as React from 'react';
import { useWindowDimensions, KeyboardAvoidingView, Platform, Keyboard, View, FlatList } from 'react-native';
import { useEffect, useState } from "react";
import { TabView } from 'react-native-tab-view';
import { useAuthStore } from "@stores/auth";
import { SafeAreaView } from '@components/containers';
import { NavigationHeader, TitleWithButton } from '@components/Header';
import { showToast } from '@utils/common';
import { Button } from "@components/common/Button";
import { post } from '@api/services/utils';
import { validateFields } from '@utils/validation';
import { COLORS } from "@constants/theme";
import { CustomTabBar } from '@components/TabBar';
import VendorDetails from './VendorDetails';
import DateDetails from './DateDetails';
import OtherDetails from './OtherDetails';
import VendorProductList from './VendorProductList';

const VendorBillFormTabs = ({ route, navigation }) => {

  const layout = useWindowDimensions();
  const currentUser = useAuthStore((state) => state.user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productLines, setProductLines] = useState([]);
  const [errors, setErrors] = useState({});
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'first', title: 'Vendor Details' },
    { key: 'second', title: 'Date & Details' },
    { key: 'third', title: 'Other Details' },
  ]);

  const [formData, setFormData] = useState({
    vendorName: "",
    purchaseType: "",
    countryOfOrigin: "",
    currency: "",
    amountPaid: "",
    paymentMode: "",
    chequeBank: "",
    chequeType: "",
    chequeNo: "",
    creditBalance: "",
    creditAmount: "",
    outstandingBalance: "",
    creditDays: "",
    date: new Date(),
    trnnumber: "",
    orderDate: new Date(),
    billDate: new Date(),
    salesPerson: { id: currentUser?.related_profile?._id || '', label: currentUser?.related_profile?.name },
    warehouse: { id: currentUser?.warehouse?.warehouse_id || '', label: currentUser?.warehouse?.warehouse_name },
    reference: "",
  });
  // console.log("🚀 ~ VendorBillFormTabs ~ formData:", JSON.stringify(formData, null, 2));

  const handleFieldChange = (field, value) => {
    setFormData(prevFormData => ({
      ...prevFormData,
      [field]: value
    }));
    if (errors[field]) {
      setErrors(prevErrors => ({
        ...prevErrors,
        [field]: null
      }));
    }
  };

  const handleAddProductLine = (newProductLine) => {
    const productLineData = {
      product_id: newProductLine.product_id,
      product_name: newProductLine.product_name,
      description: newProductLine.description || '',
      scheduledDate: newProductLine.scheduledDate || '',
      quantity: newProductLine.quantity || 0,
      uom: newProductLine.uom || { id: '', label: '' },
      unitPrice: newProductLine.unitPrice || 0,
      taxes: newProductLine.taxes || { id: '', label: '' },
      subTotal: newProductLine.subTotal || 0,
      tax: newProductLine.tax || 0,
      totalAmount: newProductLine.totalAmount || 0,
    };
    setProductLines((prevLines) => [...prevLines, productLineData]);
  };

  useEffect(() => {
    if (route.params?.newProductLine) {
      handleAddProductLine(route.params.newProductLine);
    }
  }, [route.params?.newProductLine]);

  const calculateTotals = () => {
    let untaxed = 0;
    let taxes = 0;
    productLines.forEach((line) => {
      untaxed += Number(line.subTotal || 0);
      taxes += Number(line.tax || 0);
    });
    const total = untaxed + taxes;

    setFormData((prevFormData) => ({
      ...prevFormData,
      taxTotal: taxes.toFixed(2),
      totalAmount: total.toFixed(2),
    }));
  };

  useEffect(() => {
    calculateTotals();
  }, [productLines]);

  const renderScene = ({ route }) => {
    switch (route.key) {
      case 'first':
        return <VendorDetails formData={formData} onFieldChange={handleFieldChange} errors={errors} />;
      case 'second':
        return <DateDetails formData={formData} onFieldChange={handleFieldChange} errors={errors} />;
      case 'third':
        return <OtherDetails formData={formData} onFieldChange={handleFieldChange} errors={errors} />;
      default:
        return null;
    }
  };

  const validateForm = (fieldsToValidate) => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const isSubmitDisabled = productLines.length < 0;

  const handleSubmit = async () => {
    const fieldsToValidate = ['vendorName', 'purchaseType', 'countryOfOrigin', 'currency', 'amountPaid', 'paymentMode', 'salesPerson', 'warehouse'];
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      const vendorData = {
        supplier: formData?.vendorName.id ?? null,
        supplier_name: formData?.vendorName.label ?? null,
        Trn_number: formData?.trnnumber || null,
        vendor_reference: formData?.reference || null,
        currency: formData?.currency?.id ?? null,
        purchase_type: formData?.purchaseType?.label ?? null,
        country: formData?.countryOfOrigin?.id ?? null,
        bill_date: formData?.billDate || null,
        ordered_date: formData?.orderDate || null,
        warehouse: formData?.warehouse?.id ?? null,
        date: formData?.date || null,
        payment_method_id: formData?.paymentMode?.id ?? null,
        payment_method_name: formData?.paymentMode?.label ?? null,
        sales_person_id: currentUser?.related_profile?._id || null,
        sales_person_name: currentUser?.related_profile?.name || null,
        warehouse_id: currentUser?.related_profile?.warehouse_id ?? null,
        warehouse_name: formData?.warehouse?.label ?? null,
        partner_id: formData?.vendorName?.partner ?? null,
        partner_name: formData?.vendorName?.partnerName ?? null,
        remarks: "",
        untaxed_total_amount: "200",
        total_amount: "210",
        due_date: "",
        due_amount: 210,
        paid_amount: 0,
        payment_status: un_paid,
        vendor_bill_status: un_paid,
        payment_date: "",
        amount: 210,
        type: expense,
        chq_no: null,
        chq_date: "",
        chq_type: null,
        chart_of_accounts_id: null,
        chart_of_accounts_name: null,
        status: paid,
        transaction_no: null,
        transaction: null,
        journal_id: null,
        chq_bank_id: null,
        issued_cheque: false,
        is_cheque_cleared: true,
        in_amount: 0,
        out_amount: 210,
        outstanding: 210,
        due_balance: 210,
        credit_balance: null,
        reference: null,
        time_zone: Asia / Dubai,
        total_tax_amount: 10,
        company: null,
        purchase_order_id: null,
        cheque_transaction_type: "",
        chq_book_id: null,
        chq_book_line_id: null,
        chq_bank_name: "",
        is_asset: false,
        image_url: [],
        ledger_name: "",
        ledger_type: "",
        ledger_id: null,
        ledger_display_name: "",
        online_transaction_type: done,
        card_transaction_type: done,
        is_estimation: false,
        products_lines: productLines.map((line) => ({
          product: line.product_id,
          product_name: line.product_name,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          sub_total: line.subTotal,
          tax_value: line.tax,
          scheduled_date: line.scheduledDate,
          recieved_quantity: 0,
          billed_quantity: 0,
          product_unit_of_measure: line.uom?.label || '',
          taxes: line.taxes?.id || '',
          return_quantity: 0,
          processed: false
        })),
      }
      // console.log("🚀 ~ submit ~ vendorData:", JSON.stringify(vendorData, null, 2));
      try {
        const response = await post("/createCombinedVendorBillPaymentMade", vendorData);
        if (response.success === 'true') {
          showToast({
            type: "success",
            title: "Success",
            message: response.message || "Vendor Bill created successfully",
          });
          navigation.navigate("VendorBillScreen");
        } else {
          console.error("Vendor Bill Failed:", response.message);
          showToast({
            type: "error",
            title: "ERROR",
            message: response.message || "Vendor Bill creation failed",
          });
        }
      } catch (error) {
        console.error("Error Creating Vendor Bill Failed:", error);
        showToast({
          type: "error",
          title: "ERROR",
          message: "An unexpected error occurred. Please try again later.",
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Vendor Bill Creation"
        onBackPress={() => navigation.goBack()}
        logo={false}
      />
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TabView
            navigationState={{ index, routes }}
            renderScene={renderScene}
            renderTabBar={(props) => <CustomTabBar {...props} />}
            onIndexChange={setIndex}
            initialLayout={{ width: layout.width }}
          />
        </KeyboardAvoidingView>
        <View style={{ backgroundColor: 'white', paddingHorizontal: 20, paddingBottom: 15 }}>
          <TitleWithButton
            label="Add Products"
            onPress={() => navigation.navigate('AddVendorProducts')}
          />
          <View style={{ maxHeight: 160 }}>
            <FlatList
              data={productLines}
              renderItem={({ item }) => <VendorProductList item={item} />}
              keyExtractor={(item, index) => index.toString()}
            />
          </View>
          <Button
            title="SUBMIT"
            onPress={handleSubmit}
            loading={isSubmitting}
            backgroundColor={COLORS.tabIndicator}
            disabled={isSubmitDisabled}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

export default VendorBillFormTabs;

{/* <SafeAreaView>
<NavigationHeader
  title="Vendor Bill Creation"
  onBackPress={() => navigation.goBack()}
/>
<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : null} style={{ flex: 1 }}>
  <TabView
    navigationState={{ index, routes }}
    renderScene={renderScene}
    renderTabBar={props => <CustomTabBar {...props} />} onIndexChange={setIndex}
    initialLayout={{ width: layout.width }}
  />
</KeyboardAvoidingView>
<View style={{ backgroundColor: 'white', paddingHorizontal: 50, paddingBottom: 12 }}>
<TitleWithButton
  label="Add Products"
  onPress={() => navigation.navigate('AddVendorProducts')}
/>
<FlatList
  data={productLines}
  renderItem={({ item }) => (
    <VendorProductList item={item} />
  )}
  keyExtractor={(item, index) => index.toString()}
/>
<Button
    title="SUBMIT"
    onPress={handleSubmit}
    marginTop={10}
    loading={isSubmitting}
    backgroundColor={COLORS.tabIndicator}
    disabled={isSubmitDisabled}
  />
</View>
</SafeAreaView> */}