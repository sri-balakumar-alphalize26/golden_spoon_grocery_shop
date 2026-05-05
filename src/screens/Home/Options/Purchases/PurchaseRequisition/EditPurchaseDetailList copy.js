import React, { useState, useEffect } from "react";
import { View, StyleSheet, Platform, TouchableOpacity } from "react-native";
import Text from "@components/Text";
import { FONT_FAMILY } from "@constants/theme";
import { TextInput as FormInput } from "@components/common/TextInput";
import { MultiSelectDropdownSheet } from "@components/common/BottomSheets";
import { fetchSupplierDropdown } from "@api/dropdowns/dropdownApi";

const EditPurchaseDetailList = ({ item, onPress }) => {
  console.log("🚀 ~ EditPurchaseDetailList ~ item:", JSON.stringify(item, null, 2))
  const [selectedSuppliers, setSelectedSuppliers] = useState([{
    id: '670675464e15450d26ba8eb8',
    label: 'MEC TECHNOLOGY'
  }]);
  console.log("Suppliers : ", selectedSuppliers)
  const [errors, setErrors] = useState({});
  const [dropdown, setDropdown] = useState({ suppliers: [] });
  const [searchText, setSearchText] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);

  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const supplierData = await fetchSupplierDropdown(searchText);
        setDropdown((prevDropdown) => ({
          ...prevDropdown,
          suppliers: supplierData?.map((data) => ({
            id: data._id,
            label: data.name?.trim(),
          })),
        }));
      } catch (error) {
        console.error("Error fetching Supplier dropdown data:", error);
      }
    };
    if (selectedType === "Supplier") {
      fetchSuppliers();
    }
  }, [searchText, selectedType]);

  const handleSupplierSelection = (selectedValues) => {
    const newSuppliers = selectedValues.map((supplier) => ({
      supplier_id: supplier.id,
      status: "submitted",
      supplier: {
        suplier_id: supplier.id,
        suplier_name: supplier.label,
      },
    }));
    setSelectedSuppliers(newSuppliers);
  };

  
  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible((prev) => !prev);
  };

  const renderBottomSheet = () => {
    if (selectedType === "Supplier") {
      const previousSelections = selectedSuppliers.map((supplier) => ({
        id: supplier.supplier_id,
        label: supplier.supplier?.suplier_name,
      }));
  
      return (
        <MultiSelectDropdownSheet
          isVisible={isVisible}
          items={dropdown.suppliers}
          title={selectedType}
          refreshIcon={false}
          search
          onSearchText={(value) => setSearchText(value)}
          previousSelections={previousSelections}
          onValueChange={handleSupplierSelection}
          onClose={() => setIsVisible(false)}
        />
      );
    }
    return null;
  };
   

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <Text style={styles.head}>{item?.product?.product_name?.trim() || "-"}</Text>
        <View style={styles.rightColumn}>
          <Text style={styles.content}>{item?.quantity || "-"}</Text>
          <Text style={styles.content}>{item?.remarks || "-"}</Text>
        </View>
      </View>
      <View style={styles.rightColumn}>
        <View style={styles.contentRight}>
          {item?.suppliers?.length > 0 ? (
            item.suppliers.map((supplier, index) => (
              <Text key={index} style={styles.supplierContent}>
                {supplier?.supplier?.suplier_name || "-"}
                {index < item.suppliers.length - 1 ? "," : ""}
              </Text>
            ))
          ) : (
            <Text style={styles.supplierContent}>No suppliers</Text>
          )}
        </View>
      </View>
      <FormInput
        label={"Supplier"}
        dropIcon={"menu-down"}
        multiline={true}
        editable={false}
        required
        validate={errors.suppliers}
        value={selectedSuppliers.map((supplier) => supplier.supplier?.suplier_name).join(", ")}
        onPress={() => toggleBottomSheet("Supplier")}
      />
      {renderBottomSheet()}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    marginHorizontal: 5,
    marginVertical: 5,
    backgroundColor: 'white',
    borderRadius: 15,
    ...Platform.select({
      android: {
        elevation: 4,
      },
      ios: {
        shadowColor: 'black',
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
    justifyContent: 'space-between',
    flexDirection: 'row',
    flex: 1,
  },
  head: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 17,
    marginBottom: 5,
  },
  quantityLabel: {
    color: '#666666',
    marginBottom: 5,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    textTransform: 'capitalize',
  },
  content: {
    color: '#666666',
    marginBottom: 5,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    textTransform: 'capitalize',
  },
  supplierContent: {
    color: '#666666',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize: 14,
    marginBottom: 2,
  },
});

export default EditPurchaseDetailList;

//   const validateSelection = () => {
//     if (selectedSuppliers.length === 0) {
//       setErrors((prev) => ({ ...prev, suppliers: "Please select at least one supplier." }));
//     } else {
//       setErrors((prev) => ({ ...prev, suppliers: null }));
//     }
//   };