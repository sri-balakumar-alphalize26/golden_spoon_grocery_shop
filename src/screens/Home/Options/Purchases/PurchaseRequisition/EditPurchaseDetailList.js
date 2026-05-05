import React, { useState, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import Text from "@components/Text";
import { TextInput as FormInput } from "@components/common/TextInput";
import { MultiSelectDropdownSheet } from "@components/common/BottomSheets";
import { fetchSupplierDropdown } from "@api/dropdowns/dropdownApi";

const EditPurchaseDetailList = ({ item, onPress, onSupplierChange }) => {
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  // console.log("Selected Suppliers :", selectedSuppliers)
  const [dropdownSuppliers, setDropdownSuppliers] = useState([]);
  const [isVisible, setIsVisible] = useState(false);

  // Initialize selected suppliers from props on mount
  useEffect(() => {
    if (item?.suppliers?.length > 0) {
      const initialSelections = item.suppliers.map((supplier) => ({
        id: supplier.supplier?.suplier_id,
        label: supplier.supplier?.suplier_name,
      }));
      setSelectedSuppliers(initialSelections);
    }
  }, [item]);

  // Fetch dropdown data when the dropdown opens
  const fetchDropdownSuppliers = async () => {
    try {
      const supplierData = await fetchSupplierDropdown();
      const formattedSuppliers = supplierData?.map((supplier) => ({
        id: supplier._id,
        label: supplier.name,
      }));

      // Combine selected suppliers with fetched suppliers
      const mergedSuppliers = [
        ...selectedSuppliers,
        ...formattedSuppliers
      ];

      setDropdownSuppliers(mergedSuppliers || []);
    } catch (error) {
      console.error("Error fetching supplier data:", error);
    }
  };

  const toggleDropdown = () => {
    if (!isVisible) {
      fetchDropdownSuppliers();
    }
    setIsVisible(!isVisible);
  };

  // Handle supplier selection
  // const handleSupplierSelection = (selectedValues) => {
  //   setSelectedSuppliers(selectedValues);
  // };

  const handleSupplierSelection = (selectedValues) => {
    setSelectedSuppliers(selectedValues);

    const updatedItem = {
      ...item,
      suppliers: selectedValues.map((supplier) => ({
        supplier_id: supplier.id,
        supplier_name: supplier.label,
      })),
    };
    if (onSupplierChange) {
      onSupplierChange(updatedItem);
    }
  };

  return (
    <TouchableOpacity style={styles.itemContainer} onPress={onPress}>
      <View style={styles.leftColumn}>
        <Text style={styles.head}>{item?.product?.product_name || "-"}</Text>
        <View style={styles.rightColumn}>
          <Text style={styles.content}>{item?.quantity || "-"}</Text>
          <Text style={styles.content}>{item?.remarks || "-"}</Text>
        </View>
      </View>
      {/* <FormInput
        label="Supplier"
        value={
          selectedSuppliers.length > 0
            ? selectedSuppliers.map((supplier) => supplier.label).join(", ")
            : "No suppliers selected"
        }
        editable={false}
        dropIcon="menu-down"
        multiline={true}
        onPress={toggleDropdown}
      /> */}
      <FormInput
        label="Supplier"
        value={selectedSuppliers.map((s) => s.label).join(", ")}
        editable={false}
        dropIcon="menu-down"
        multiline={true}
        onPress={toggleDropdown}
      />
      {isVisible && (
        <MultiSelectDropdownSheet
          isVisible={isVisible}
          items={dropdownSuppliers}
          previousSelections={selectedSuppliers}
          title="Select Supplier"
          refreshIcon={false}
          onValueChange={handleSupplierSelection}
          onClose={toggleDropdown}
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
    elevation: 4,
    padding: 20,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    flexDirection: "row",
    justifyContent: "space-between",
    flex: 1,
  },
  head: {
    fontSize: 17,
    fontWeight: "bold",
    marginBottom: 5,
  },
  content: {
    color: "#666",
    fontSize: 14,
    textTransform: "capitalize",
  },
});

export default EditPurchaseDetailList;
