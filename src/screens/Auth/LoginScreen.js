import React, { useState } from "react";
import {
  View,
  Keyboard,
  StyleSheet,
  Image,
  TouchableWithoutFeedback,
} from "react-native";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { LogBox } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Button } from "@components/common/Button";
import {  OverlayLoader } from "@components/Loader";
import { post } from "@api/services/utils";
import { useNavigation } from "@react-navigation/native";
import Text from "@components/Text";
import { TextInput } from "@components/common/TextInput";
import { RoundedScrollContainer, SafeAreaView } from "@components/containers";
import { useAuthStore } from "@stores/auth";
import { showToastMessage } from "@components/Toast";
// Removed privacy policy checkbox

LogBox.ignoreLogs(["new NativeEventEmitter"]);
LogBox.ignoreAllLogs();

const LoginScreen = () => {

  const navigation = useNavigation();
  const setUser = useAuthStore(state => state.login)

  // Removed privacy policy checkbox state
  // destructuring Styles
  const { container, tinyLogo, imageContainer } = styles;

  LogBox.ignoreLogs([
    "Non-serializable values were found in the navigation state",
  ]);

  const [inputs, setInputs] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    Keyboard.dismiss();
    let isValid = true;
    if (!inputs.username) {
      handleError("Please input user name", "username");
      isValid = false;
    }
    if (!inputs.password) {
      handleError("Please input password", "password");
      isValid = false;
    }
    // Privacy policy agreement removed
    if (isValid) {
      login();
    }
  };

  const login = async () => {
    setLoading(true);
    try {
      const response = await post("/viewuser/login", {
        user_name: inputs.username,
        password: inputs.password,
      });
      if (response.success === true) {
        const userData = response.data[0];
        // const userToken = response.token
        if (
          inputs.username === userData.username,
          inputs.password === userData.password
        ) {
          // await AsyncStorage.setItem("userToken", userToken);
          await AsyncStorage.setItem("userData", JSON.stringify(userData));
          setUser(userData)
          console.log("userData", userData);
          navigation.navigate("AppNavigator");
        } else {
          showToastMessage("Invalid Details")
        }
      } else {
        showToastMessage("Error! User does not exist");
      }
    } catch (error) {
      showToastMessage(`error! occurred while logging in ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOnchange = (text, input) => {
    setInputs((prevState) => ({ ...prevState, [input]: text }));
  };

  const handleError = (error, input) => {
    setErrors((prevState) => ({ ...prevState, [input]: error }));
  };

  return (
    <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
      <SafeAreaView backgroundColor={COLORS.white}>
        <OverlayLoader visible={loading} />
        {/* <ScrollView style={{ paddingHorizontal: 15, flex: 1, backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}> */}
            <View style={imageContainer}>
              <View style={styles.logoWrapper}>
                <Image
                  source={require('@assets/images/header/logo_header.png')}
                  style={{ width: 300, height: 180, alignSelf: 'center' }}
                  resizeMode="contain"
                />
              </View>
            </View>
        <RoundedScrollContainer backgroundColor={COLORS.white} paddingHorizontal={15} borderTopLeftRadius={40} borderTopRightRadius={40}>
          <View style={{ paddingTop: 8 }}>
            <View style={{ marginVertical: 5, marginHorizontal: 10 }}>
              <View style={{ marginTop: 0, marginBottom: 15 }}>
                <Text style={{ fontSize: 25, fontFamily: FONT_FAMILY.urbanistBold, color: '#2e2a4f' }}>Login</Text>
              </View>
              <TextInput
                onChangeText={(text) => handleOnchange(text, "username")}
                onFocus={() => handleError(null, "username")}
                iconName="account-outline"
                label="ui need login screen odoo to work not login scren
                sername or Email"
                placeholder="Enter Username or Email"
                error={errors.username}
                column={true}
                login={true}
              />
              <TextInput
                onChangeText={(text) => handleOnchange(text, "password")}
                onFocus={() => handleError(null, "password")}
                error={errors.password}
                iconName="lock-outline"
                label="Password"
                placeholder="Enter password"
                password
                column={true}
                login={true}
              />
              {/* Privacy policy checkbox removed as requested */}
              <View style={styles.bottom}>
                <Button title="Login" onPress={validate} />
              </View>
            </View>
          </View>
        </RoundedScrollContainer>
        {/* </ScrollView> */}
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingTop: 10
  },
  tinyLogo: {
    width: 200,
    height: 200,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: '4%',
  },
  logoWrapper: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 8,
  },
  bottom: {
    alignItems: "center",
    marginTop: 10,
  },
  label: {
    marginVertical: 5,
    fontSize: 14,
    color: COLORS.grey,
    marginLeft: 180,
    marginTop: 15,
  },
});

export default LoginScreen;
