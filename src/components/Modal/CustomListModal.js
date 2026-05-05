import React from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
  Dimensions,
} from "react-native";
import Modal from "react-native-modal";
import Text from "@components/Text";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { AntDesign } from "@expo/vector-icons";
import { NavigationHeader } from "@components/Header";

const { height } = Dimensions.get("window");

const CustomListModal = ({
  items,
  onValueChange,
  isVisible,
  onAdd = () => { },
  onAddIcon = true,
  onClose = () => { },
  title,
}) => {
  const handleCustomModal = (selectedCustomData) => {
    onValueChange(selectedCustomData);
    onClose();
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
        {onAddIcon ? <View style={[styles.container]}>
          <TouchableOpacity onPress={onClose} style={styles.goBackContainer}>
            <AntDesign name="left" size={20} color={"white"} />
          </TouchableOpacity>
          <Text style={[styles.title]}>{title}</Text>
          <View style={styles.addButtonContainer}>
            <TouchableOpacity style={styles.addButton} onPress={onAdd}>
              <AntDesign name="plus" size={20} color={"white"} />
              <Text style={styles.addText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View> :
          <>
            <NavigationHeader title={title} onBackPress={onClose} />
          </>}
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
      </View>
    </Modal>
  );
};

export default CustomListModal;

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
  addButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  addText: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.white,
    marginLeft: 5,
  },
});
