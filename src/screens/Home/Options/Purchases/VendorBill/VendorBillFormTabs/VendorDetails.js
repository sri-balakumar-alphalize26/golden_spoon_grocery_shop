import React, { useState, useEffect } from 'react';
import { RoundedScrollContainer } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import { fetchCurrencyDropdown, fetchCountryDropdown, fetchSupplierDropdown, fetchPaymentModeDropdown } from '@api/dropdowns/dropdownApi';
import { purchaseType, chequeType } from '@constants/dropdownConst';

const VendorDetails = ({ formData, onFieldChange, errors }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [dropdown, setDropdown] = useState({
    vendorName: [],
    purchaseType: [],
    countryOfOrigin: [],
    currency: [],
    paymentMode: [],
    chequeType: [],
  });

  useEffect(() => {
    const fetchSuppliers = async () => {
      if (selectedType === "Vendor Name") {
        try {
          const vendorData = await fetchSupplierDropdown(searchText);
          setDropdown((prevDropdown) => ({
            ...prevDropdown,
            vendorName: vendorData?.map((data) => ({
              id: data._id,
              label: data.name?.trim(),
              partner: data.partner.partner_id,
              partnerName: data.partner.partner_name,
            })),
          }));
        } catch (error) {
          console.error("Error fetching Supplier dropdown data:", error);
        }
      }
    };
    fetchSuppliers();
  }, [searchText, selectedType]);

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [countryData, currencyData, paymentModeData] = await Promise.all([
          fetchCountryDropdown(),
          fetchCurrencyDropdown(),
          fetchPaymentModeDropdown(),
        ]);

        const filteredPaymentModes = paymentModeData.filter(data =>
          ["cheque", "credit", "cash"].includes(data.payment_method_name.toLowerCase())
        );

        setDropdown({
          countryOfOrigin: countryData.map(data => ({
            id: data._id,
            label: data.country_name,
          })),
          currency: currencyData.map(data => ({
            id: data._id,
            label: data.currency_name,
          })),
          paymentMode: filteredPaymentModes.map(data => ({
            id: data._id,
            label: data.payment_method_name,
          })),
        });
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
      }
    };

    fetchDropdownData();
  }, []);

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedType) {
      case 'Vendor Name':
        items = dropdown.vendorName;
        fieldName = "vendorName";
        break;
      case "Purchase Type":
        items = purchaseType;
        fieldName = "purchaseType";
        break;
      case "Cheque Type":
        items = chequeType;
        fieldName = "chequeType";
        break;  
      case "Country Of Origin":
        items = dropdown.countryOfOrigin;
        fieldName = "countryOfOrigin";
        break;
      case "Currency":
        items = dropdown.currency;
        fieldName = "currency";
        break;
      case 'Payment Mode':
        items = dropdown.paymentMode;
        fieldName = "paymentMode";
        break;
      default:
        return null;
    }
    return (
      <DropdownSheet
        isVisible={isVisible}
        items={items}
        title={selectedType}
        onClose={() => setIsVisible(false)}
        search={selectedType === "Vendor Name"}
        onSearchText={(value) => setSearchText(value)}
        onValueChange={(value) => onFieldChange(fieldName, value)}
      />
    );
  };

  return (
    <RoundedScrollContainer>
      <FormInput
        label={"Vendor Name"}
        placeholder={"Select Vendor Name"}
        dropIcon={"menu-down"}
        editable={false}
        required
        multiline={true}
        validate={errors.vendorName}
        value={formData.vendorName?.label}
        onPress={() => toggleBottomSheet('Vendor Name')}
      />
      <FormInput
        label="Purchase Type"
        placeholder="Select Purchase Type"
        dropIcon="menu-down"
        editable={false}
        required
        validate={errors.purchaseType}
        value={formData.purchaseType?.label}
        onPress={() => toggleBottomSheet("Purchase Type")}
      />
      <FormInput
        label={"Country Of Origin"}
        placeholder="Select Country"
        dropIcon="menu-down"
        editable={false}
        validate={errors.countryOfOrigin}
        value={formData.countryOfOrigin?.label}
        required
        onPress={() => toggleBottomSheet("Country Of Origin")}
      />
      <FormInput
        label="Currency"
        placeholder="Select Currency"
        dropIcon="menu-down"
        editable={false}
        validate={errors.currency}
        value={formData.currency?.label}
        required
        onPress={() => toggleBottomSheet("Currency")}
      />
      <FormInput
        label={"Amount Paid"}
        placeholder={"Enter Amount Paid"}
        editable={false}
        keyboardType="numeric"
        value={formData.amountPaid}
        onChangeText={(value) => onFieldChange('amountPaid', value)}
      />
      <FormInput
        label="Payment Mode"
        placeholder="Select Payment Mode"
        dropIcon="menu-down"
        editable={false}
        validate={errors.paymentMode}
        value={formData.paymentMode?.label}
        required
        onPress={() => toggleBottomSheet("Payment Mode")}
      />
      {formData.paymentMode?.label === "cheque" && (
        <>
          <FormInput
            label="Cheque Bank"
            placeholder="Select Bank Cheque"
            dropIcon="menu-down"
            editable={false}
            validate={errors.chequeBank}
            value={formData.chequeBank?.label}
            required
            onPress={() => toggleBottomSheet("Cheque Bank")}
          />
          <FormInput
            label="Cheque Date"
            dropIcon="calendar"
            placeholder="dd-mm-yyyy"
            editable={false}
            required
            // value={formatDateandTime(formData.chequeDate)}
            onPress={() => setIsDatePickerVisible(true)}
          />
          <FormInput
            label="Cheque Type"
            placeholder="Select Cheque Type"
            dropIcon="menu-down"
            editable={false}
            validate={errors.chequeType}
            value={formData.chequeType?.label}
            required
            onPress={() => toggleBottomSheet("Cheque Type")}
          />
          <FormInput
            label="Cheque No"
            placeholder="Select Cheque No"
            dropIcon="menu-down"
            editable={false}
            validate={errors.chequeNo}
            value={formData.chequeNo?.label}
            required
            onPress={() => toggleBottomSheet("Cheque No")}
          />
        </>
      )}
      {formData.paymentMode?.label === "credit" && (
        <>
          <FormInput
            label="Credit Balance"
            editable={false}
            validate={errors.creditBalance}
            value={formData.creditBalance}
            required
            onChangeText={(value) => onFieldChange("creditBalance", value)}
          />
          <FormInput
            label="Credit Amount"
            editable={false}
            validate={errors.creditAmount}
            value={formData.creditAmount}
            required
            onChangeText={(value) => onFieldChange("creditAmount", value)}
          />
          <FormInput
            label="Outstanding Balance"
            editable={false}
            validate={errors.outstandingBalance}
            value={formData.outstandingBalance}
            required
            onChangeText={(value) => onFieldChange("outstandingBalance", value)}
          />
          <FormInput
            label="Credit Days"
            editable={false}
            validate={errors.creditDays}
            value={formData.creditDays}
            required
            onChangeText={(value) => onFieldChange("creditDays", value)}
          />
        </>
      )}
      {renderBottomSheet()}
    </RoundedScrollContainer>
  );
};

export default VendorDetails;