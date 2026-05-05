import React, { useState, useEffect, useCallback } from "react";
import { FAB, Portal } from "react-native-paper";
import { RoundedContainer, SafeAreaView } from "@components/containers";
import { NavigationHeader } from "@components/Header";
import { OverlayLoader } from "@components/Loader";
import { EmptyItem, EmptyState } from "@components/common/empty";
import { FlashList } from "@shopify/flash-list";
import {
  InputModal,
  CustomListModal,
  EmployeeListModal,
} from "@components/Modal";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { showToastMessage } from "@components/Toast";
import InventoryList from "./InventoryList";
import { fetchInventoryBoxRequest } from "@api/services/generalApi";
import { fetchInventoryBoxDemo } from "@api/services/utils";
import {
  fetchInventoryDetails,
  fetchInventoryDetailsByName,
} from "@api/details/detailApi";
import { useDataFetching } from "@hooks";
import { formatData } from "@utils/formatters";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { useAuthStore } from '@stores/auth';
import { reasons } from "@constants/dropdownConst";
import { fetchEmployeesDropdown } from "@api/dropdowns/dropdownApi";
import { Text, View, Pressable } from 'react-native';
import axios from 'axios';
import INVENTORY_API_BASE from '@api/config/inventoryConfig';

const InventoryScreen = ({ navigation }) => {
  // Managing modal, loading, and state variables
  const isFocused = useIsFocused();
  const [isVisibleModal, setIsVisibleModal] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [getDetail, setGetDetail] = useState(null);
  const [employee, setEmployee] = useState([]);
  const [isVisibleCustomListModal, setIsVisibleCustomListModal] =
    useState(false);
  const [isVisibleEmployeeListModal, setIsVisibleEmployeeListModal] =
    useState(false);

  // Add state to hold demo inventory boxes
  const [demoBoxes, setDemoBoxes] = useState([]);
  // Add state to track selected box
  const [selectedBox, setSelectedBox] = useState(null);
  // Only show box selection UI after clicking Show (handleModalInput)
  const [showBoxSelection, setShowBoxSelection] = useState(false);

  const { data, loading, fetchData, fetchMoreData } = useDataFetching(
    fetchInventoryBoxRequest
  );

  const currentUser = useAuthStore((state) => state.user);
  const warehouseId = currentUser?.warehouse?.warehouse_id || "";

  // Helper function to check if the user is responsible for the inventory
  const isResponsibleOrEmployee = (inventoryDetails) => {
    const responsiblePersonId = inventoryDetails?.responsible_person?._id;
    const employeeIds = Array.isArray(inventoryDetails?.employees)
      ? inventoryDetails.employees.map((employee) => employee?._id).filter(Boolean)
      : [];
    const tempAssigneeIds = Array.isArray(inventoryDetails?.temp_assignee)
      ? inventoryDetails.temp_assignee.map((tempAssignee) => tempAssignee?._id).filter(Boolean)
      : [];

    return (
      currentUser &&
      (currentUser.related_profile?._id === responsiblePersonId ||
        employeeIds.includes(currentUser.related_profile?._id) ||
        tempAssigneeIds.includes(currentUser.related_profile?._id))
    );
  };

  // Fetch employee dropdown data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const employeeDropdown = await fetchEmployeesDropdown();
        const extract = employeeDropdown.map((employee) => ({
          id: employee._id,
          label: employee.name,
        }));
        setEmployee(extract);
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
      }
    };

    fetchData();
  }, []);

  // Refetch data when screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  // Refetch data when screen becomes active
  useEffect(() => {
    if (isFocused) {
      fetchData();
    }
  }, [isFocused]);

  // Handle load more action for pagination
  const handleLoadMore = () => {
    fetchMoreData();
  };

  // Handle scanning process and navigating based on scanned data
  const handleScan = async (scannedData) => {
    setScanLoading(true);
    try {
      const inventoryDetails = await fetchInventoryDetails(scannedData);
      if (inventoryDetails.length > 0) {
        const details = inventoryDetails[0];
        setGetDetail(details);
        if (isResponsibleOrEmployee(details)) {
          setIsVisibleCustomListModal(true);
        } else {
          navigation.navigate("InventoryDetails", {
            inventoryDetails: details,
          });
        }
      } else {
        showToastMessage("No inventory box found for this box no");
      }
    } catch (error) {
      console.error("Error fetching inventory details:", error);
      showToastMessage("Error fetching inventory details");
    } finally {
      setScanLoading(false);
    }
  };

  // Update handleModalInput to use path param API
  const handleModalInput = async (boxNumber) => {
    setModalLoading(true);
    try {
    const response = await axios.get(`${INVENTORY_API_BASE}/api/view_inventory_box/${boxNumber}`);
      console.log('API response:', response.data); // <-- Log the response structure
      // Fix: Use response.data.inventory_boxes if present
      let boxes = Array.isArray(response.data.inventory_boxes)
        ? response.data.inventory_boxes
        : (Array.isArray(response.data) ? response.data : [response.data]);
      if (boxes && boxes.length > 0 && boxes[0] && Object.keys(boxes[0]).length > 0) {
        setDemoBoxes(boxes);
        setShowBoxSelection(true);
      } else {
        setDemoBoxes([]);
        setShowBoxSelection(false);
        showToastMessage("No inventory box found");
      }
    } catch (error) {
      setDemoBoxes([]);
      setShowBoxSelection(false);
      showToastMessage("Error fetching inventory details");
    } finally {
      setModalLoading(false);
    }
  };

  // Update handleBoxSelection to hide box selection and show reason modal
  const handleBoxSelection = (box) => {
    setSelectedBox(box);
    setShowBoxSelection(false);
    setIsVisibleCustomListModal(true);
  };

  // Handle item press: fetch details and navigate or show modal (mirrors handleScan behaviour)
  const handleItemPress = async (item) => {
    setScanLoading(true);
    try {
      // Try to derive an identifier for the inventory detail
      const id = item?._id || item?.id || item?.boxes?._id || item?.boxes?.id;
      let inventoryDetails = [];

      if (id) {
        // If we have an id, fetch by id
        const resp = await fetchInventoryDetails(id);
        inventoryDetails = resp && resp.data ? resp.data : resp;
      } else {
        // Fallback: search by box name or item name
        const name = item?.boxes?.name || item?.name || item?.box_no || '';
        const resp = await fetchInventoryDetailsByName(name, warehouseId);
        inventoryDetails = resp && resp.data ? resp.data : resp;
      }

      if (inventoryDetails && inventoryDetails.length > 0) {
        const details = inventoryDetails[0];
        setGetDetail(details);
        if (isResponsibleOrEmployee(details)) {
          setIsVisibleCustomListModal(true);
        } else {
          navigation.navigate('InventoryDetails', {
            inventoryDetails: details,
          });
        }
      } else {
        showToastMessage('No inventory box found for this item');
      }
    } catch (error) {
      console.error('Error fetching inventory details on item press:', error);
      showToastMessage('Error fetching inventory details');
    } finally {
      setScanLoading(false);
    }
  };

  // Render inventory items or empty state (pass onPress handler)
  const renderItem = ({ item }) =>
    item.empty ? <EmptyItem /> : <InventoryList item={item} onPress={() => handleItemPress(item)} />;

  const renderEmptyState = () => (
    <EmptyState
      imageSource={require("@assets/images/EmptyData/empty_inventory_box.png")}
      message={""}
    />
  );

  // Handle box opening request for inventory forms
  const handleBoxOpeningRequest = (value) => {
    if (value && selectedBox) {
      navigation.navigate("InventoryForm", {
        reason: value,
        inventoryDetails: selectedBox,
      });
    }
  };

  const handleSelectTemporaryAssignee = (value) => {
  };
  // Render the inventory list or empty state based on data
  const renderContent = () => (
    <FlashList
      data={formatData(data, 1)}
      numColumns={1}
      renderItem={renderItem}
      keyExtractor={(item, index) => index.toString()}
      contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.2}
      estimatedItemSize={100}
    />
  );

  const renderInventoryRequest = () =>
    data.length === 0 && !loading ? renderEmptyState() : renderContent();

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Inventory Management"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedContainer>
        {loading && <OverlayLoader visible />}
        {/* Only show inventory management content if not showing box selection */}
        {!showBoxSelection ? (
          <>
            {renderInventoryRequest()}
            {isFocused && (
              <Portal>
                <FAB.Group
                  fabStyle={{
                    backgroundColor: COLORS.primaryThemeColor,
                    borderRadius: 30,
                  }}
                  color={COLORS.white}
                  backdropColor="rgba(0, 0, 2, 0.7)"
                  open={isFabOpen}
                  visible={isFocused}
                  icon={isFabOpen ? "arrow-up" : "plus"}
                  actions={[
                    {
                      icon: "barcode-scan",
                      label: "Scan",
                      labelStyle: {
                        fontFamily: FONT_FAMILY.urbanistSemiBold,
                        color: COLORS.white,
                      },
                      onPress: () =>
                        navigation.navigate("Scanner", {
                          onScan: handleScan,
                          // onClose: true,
                        }),
                    },
                    {
                      icon: "pencil",
                      label: "Box no",
                      labelStyle: {
                        fontFamily: FONT_FAMILY.urbanistSemiBold,
                        color: COLORS.white,
                      },
                      onPress: () => setIsVisibleModal(true),
                    },
                  ]}
                  onStateChange={({ open }) => setIsFabOpen(open)}
                />
              </Portal>
            )}
          </>
        ) : (
          // Show box selection only (hide inventory management content)
          <View style={{padding: 16}}>
            <Text style={{fontWeight: 'bold', marginBottom: 8}}>Select a box:</Text>
            {demoBoxes.map((box, idx) => (
              <Pressable
                key={box.id || idx}
                onPress={() => handleBoxSelection(box)}
                style={({ pressed }) => [{
                  padding: 12,
                  backgroundColor: pressed ? '#eee' : '#fff',
                  borderRadius: 6,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: '#ccc',
                }]}
              >
                <Text style={{fontSize: 16}}>{box.name} ({box.warehouse_name})</Text>
              </Pressable>
            ))}
          </View>
        )}
      </RoundedContainer>
      <InputModal
        isVisible={isVisibleModal}
        onClose={() => setIsVisibleModal(false)}
        onSubmit={handleModalInput}
      />
      <CustomListModal
        isVisible={isVisibleCustomListModal}
        items={reasons}
        title="Select Reason"
        onClose={() => setIsVisibleCustomListModal(false)}
        onValueChange={handleBoxOpeningRequest}
        onAdd={() => {
          setIsVisibleEmployeeListModal(true),
            setIsVisibleCustomListModal(false);
        }}
        selectedBox={selectedBox}
      />
      <EmployeeListModal
        isVisible={isVisibleEmployeeListModal}
        items={employee}
        boxId={getDetail?._id}
        title="Select Assignee"
        onClose={() => setIsVisibleEmployeeListModal(false)}
        onValueChange={handleSelectTemporaryAssignee}
      />

      {(scanLoading || modalLoading) && <OverlayLoader visible />}
    </SafeAreaView>
  );
};

export default InventoryScreen;
