import React, { useState, useEffect } from "react";
import { View, StyleSheet, Platform, TouchableOpacity } from "react-native";
import Text from "@components/Text";
import { FONT_FAMILY } from "@constants/theme";
import { TextInput as FormInput } from "@components/common/TextInput";
import { MultiSelectDropdownSheet } from "@components/common/BottomSheets";
import { fetchSupplierDropdown } from "@api/dropdowns/dropdownApi";

const EditPurchaseDetailList = ({ item, onPress }) => {
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [dropdownSuppliers, setDropdownSuppliers] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  // Initialize selected suppliers from item.suppliers
  useEffect(() => {
    if (item?.suppliers) {
      const initialSelections = item.suppliers.map((supplier) => ({
        id: supplier.supplier?.suplier_id,
        label: supplier.supplier?.suplier_name,
      }));
      setSelectedSuppliers(initialSelections);
    }
  }, [item]);

  // Fetch supplier dropdown data when the bottom sheet is visible or search text changes
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const supplierData = await fetchSupplierDropdown(searchText);
        const formattedSuppliers = supplierData?.map((data) => ({
          id: data._id,
          label: data.name?.trim(),
        }));
        setDropdownSuppliers(formattedSuppliers || []);
      } catch (error) {
        console.error("Error fetching supplier dropdown data:", error);
      }
    };

    if (isVisible) fetchSuppliers();
  }, [searchText, isVisible]);

  // Handle selection changes from the dropdown
  const handleSupplierSelection = (selectedValues) => {
    setSelectedSuppliers(selectedValues);
  };

  // Toggle the visibility of the bottom sheet
  const toggleBottomSheet = () => setIsVisible((prev) => !prev);

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <Text style={styles.head}>{item?.product?.product_name?.trim() || "-"}</Text>
        <View style={styles.rightColumn}>
          <Text style={styles.content}>{item?.quantity || "-"}</Text>
          <Text style={styles.content}>{item?.remarks || "-"}</Text>
        </View>
      </View>
      <FormInput
        label="Supplier"
        dropIcon="menu-down"
        multiline
        editable={false}
        value={selectedSuppliers?.map((supplier) => supplier.label).join(", ")}
        onPress={toggleBottomSheet}
      />
      {isVisible && (
        <MultiSelectDropdownSheet
          isVisible={isVisible}
          items={dropdownSuppliers}
          title="Select Supplier"
          search
          onSearchText={(value) => setSearchText(value)}
          previousSelections={selectedSuppliers}
          onValueChange={handleSupplierSelection}
          onClose={toggleBottomSheet}
        />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    marginHorizontal: 5,
    marginVertical: 5,
    backgroundColor: "white",
    borderRadius: 15,
    ...Platform.select({
      android: {
        elevation: 4,
      },
      ios: {
        shadowColor: "black",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
      },
    }),
    padding: 20,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    justifyContent: "space-between",
    flexDirection: "row",
    flex: 1,
  },
  head: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 17,
    marginBottom: 5,
  },
  content: {
    color: "#666666",
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    textTransform: "capitalize",
  },
});

export default EditPurchaseDetailList;
