import React, { useState, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
  Dimensions,
} from "react-native";
import Modal from "react-native-modal";
import { AntDesign } from "@expo/vector-icons";
import Text from "@components/Text";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { NavigationHeader } from "@components/Header";
import { showToastMessage } from "@components/Toast";
import { put } from "@api/services/utils";
import { TextInput } from "@components/common/TextInput";

const { height } = Dimensions.get("window");

const EmployeeListModal = ({
  items,
  isVisible,
  onClose = () => {},
  title,
  boxId,
}) => {
  const [optionModalVisible, setOptionModalVisible] = useState(false);
  const [fromDateVisible, setFromDateVisible] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [fromDate, setFromDate] = useState(new Date());
  const [toDate, setToDate] = useState(new Date());
  const [toDateVisible, setToDateVisible] = useState(false);
  const [mode, setMode] = useState("date");

  useEffect(() => {
    if (selectedEmployee) {
      setOptionModalVisible(true);
    }
  }, [selectedEmployee]);

  useEffect(() => {
    setOptionModalVisible(false);
    // setFromDateVisible(false);
    setSelectedEmployee(null);
  }, []);

  // useEffect(() => {
  //   if (
  //     selectedOption === "in_between" &&
  //     fromDate &&
  //     toDate &&
  //     mode !== "date"
  //   ) {
  //     handleApiCall(selectedOption);
  //   }
  // }, [fromDate, toDate]);

  const handleCustomModal = (selectedCustomData) => {
    setSelectedEmployee(selectedCustomData);
  };

  const showMode = (currentMode) => {
    setFromDateVisible(true);
    setMode(currentMode);
  };

  const handleApiCall = async (option) => {
    if (selectedEmployee) {
      const data = {
        box_id: boxId,
        temp_assignee: selectedEmployee?.id,
        type_of_assign: option,
        from_date: fromDate || new Date(),
        to_date: toDate || new Date(),
      };
      console.log("🚀 ~ handleApiCall ~ data:", data);
      try {
        const response = await put("/updateInventoryBox", data);
        if (response.success === true) {
          showToastMessage("Temporary assignee updated successfully");
          onClose();
          setFromDateVisible(false);
        }
        console.log("🚀 ~ handleApiCall ~ response:", response);
      } catch (error) {
        console.log("🚀 ~ handleApiCall ~ error:", error);
      }
    } else {
      showToastMessage("Please select an employee first.");
    }
  };

  const handleOptionPress = (option) => {
    setSelectedOption(option);
    if (option === "in_between") {
      setFromDateVisible(true); 
    } else {
      setOptionModalVisible(false);
      handleApiCall(option);
    }
  };

  const handleFromDateConfirm = (date) => {
    setFromDateVisible(false); // Hide the "From" date picker
    setFromDate(date);
    setToDateVisible(true); // Show the "To" date picker
  };

  const handleToDateConfirm = (date) => {
    setToDateVisible(false); // Hide the "To" date picker
    setToDate(date);
  };

  return (
    <Modal
      isVisible={isVisible}
      animationIn="slideInDown"
      animationOut="slideOutDown"
      backdropOpacity={0.7}
      animationInTiming={400}
      animationOutTiming={300}
      backdropTransitionInTiming={400}
      backdropTransitionOutTiming={300}
      style={{
        margin: height < 800 ? 20 : 20,
        paddingVertical: height < 800 ? 20 : 10,
      }}
    >
      <View style={styles.modalContainer}>
        <View style={[styles.container]}>
          <TouchableOpacity onPress={onClose} style={styles.goBackContainer}>
            <AntDesign name="left" size={20} color={"white"} />
          </TouchableOpacity>
          <Text style={[styles.title]}>{title}</Text>
        </View>
        <View style={styles.modalContent}>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.modalListContainer}>
                <TouchableOpacity onPress={() => handleCustomModal(item)}>
                  <Text
                    style={{
                      fontFamily: FONT_FAMILY.urbanistSemiBold,
                      fontSize: 16,
                    }}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            showsVerticalScrollIndicator={false}
          />
        </View>
        <Modal
          isVisible={optionModalVisible}
          onBackdropPress={() => setOptionModalVisible(false)}
          animationIn="slideInUp"
          animationOut="slideOutDown"
        >
          <NavigationHeader
            title={"Options"}
            onBackPress={() => setOptionModalVisible(false)}
          />

          <View style={styles.optionModal}>
            <View style={styles.selectedDatesContainer}>
              <Text style={styles.selectedDatesLabel}>From:</Text>
              <Text style={styles.selectedDateText}>
                {fromDate ? fromDate.toDateString() : "Select date"}
              </Text>
            </View>
            <View style={styles.selectedDatesContainer}>
              <Text style={styles.selectedDatesLabel}>To:</Text>
              <Text style={styles.selectedDateText}>
                {toDate ? toDate.toDateString() : "Select date"}
              </Text>
            </View>
           
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => handleOptionPress("one_time")}
            >
              <Text style={styles.optionText}>Onetime</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => handleOptionPress("one_day")}
            >
              <Text style={styles.optionText}>Oneday</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => handleOptionPress("one_hour")}
            >
              <Text style={styles.optionText}>Onehour</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => handleOptionPress("in_between")}
            >
              <Text style={styles.optionText}>From-To</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => handleApiCall("in_between")}
            >
              <AntDesign name="checkcircle" size={24} color="white" />
              <Text style={styles.confirmButtonText}>Confirm Date</Text>
            </TouchableOpacity>
          </View>
        </Modal>
        {fromDateVisible && (
          <DateTimePickerModal
            isVisible={fromDateVisible}
            mode={"date"}
            date={fromDate}
            onConfirm={handleFromDateConfirm}
            onCancel={() => {
              setFromDateVisible(false);
              setOptionModalVisible(false);
            }}
          />
        )}
        {toDateVisible && (
          <DateTimePickerModal
            isVisible={toDateVisible}
            mode={"date"}
            date={toDate}
            onConfirm={handleToDateConfirm}
            onCancel={() => {
              setToDateVisible(false);
              setOptionModalVisible(false);
            }}
          />
        )}
      </View>
    </Modal>
  );
};

export default EmployeeListModal;

export const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    padding: 20,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 10,
    width: "100%",
  },
  modalListContainer: {
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
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 15,
    backgroundColor: COLORS.primaryThemeColor,
  },
  goBackContainer: {
    marginRight: 15,
  },
  title: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    flex: 1,
    paddingLeft: 10,
    color: COLORS.white,
  },
  optionModal: {
    backgroundColor: "white",
    padding: 20,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginVertical: 5,
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 5,
    width: "100%",
    alignItems: "center",
  },
  optionText: {
    color: "white",
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 16,
  },
  datePicker: {
    backgroundColor: "white",
  },
  selectedDatesContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  selectedDatesLabel: {
    fontFamily: FONT_FAMILY.urbanistBold,
    marginRight: 5,
  },
  selectedDateText: {
    fontFamily: FONT_FAMILY.urbanistRegular,
    fontSize: 16,
    color: COLORS.darkGray,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 20,
    // marginTop: 20,
  },
  confirmButtonText: {
    color: "white",
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 16,
    marginLeft: 5,
  },
});
