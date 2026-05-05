import React, { useRef, useState } from "react";
import { StyleSheet, View, TouchableOpacity, Image } from "react-native";
import SignatureScreen from "react-native-signature-canvas";
import Text from "./Text";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import * as FileSystem from "expo-file-system";
import { uploadApi } from "@api/uploads";

export const CustomClearButton = ({ title, onPress }) => {
    return (
        <TouchableOpacity
            style={[styles.button, { backgroundColor: COLORS.orange }]}
            onPress={onPress}
        >
            <Text style={[styles.buttonText, { color: "white" }]}>{title}</Text>
        </TouchableOpacity>
    );
};

const SignaturePad = ({ setUrl, setScrollEnabled, title, previousSignature = '' }) => {
    const [isSign, setSign] = useState(false);
    const ref = useRef();

    const handleOK = (signature) => {
        const path = FileSystem.cacheDirectory + `signature${Date.now()}.png`;
        FileSystem.writeAsStringAsync(
            path,
            signature.replace("data:image/png;base64,", ""),
            { encoding: FileSystem.EncodingType.Base64 }
        )
            .then(() => {
                console.log("Writing signature to file completed. Path:", path);
                return FileSystem.getInfoAsync(path);
            })
            .then(async () => {
                try {
                    const uploadUrl = await uploadApi(path);
                    console.log("API response upload url:", uploadUrl);
                    if (uploadUrl) {
                        setUrl(uploadUrl);
                    }
                } catch (error) {
                    console.log("API error:", error);
                }
            })
            .catch((error) => {
                console.error("Error:", error);
            });
    };

    const handleClear = () => {
        ref.current.clearSignature();
        setSign(null);
    };

    const handleConfirm = () => {
        console.log("end");
        ref.current.readSignature()
    };

    const handleEnd = () => {
        ref.current.readSignature();
        setScrollEnabled(true);
        setSign(true);
    };

    const style = `.m-signature-pad--footer {display: none; margin: 0px;}`;

    return (
        <>
            <Text style={styles.label}>{title}</Text>
            <View style={styles.signContainer}>
                {previousSignature ? (
                    <Image
                        // resizeMode={"contain"}
                        style={{ width: "100%", height: '100%' }}
                        source={{ uri: previousSignature }}
                    />
                ) : <SignatureScreen
                    webStyle={style}
                    ref={ref}
                    onOK={handleOK}
                    onBegin={() => setScrollEnabled(false)}
                    onEnd={handleEnd}
                />}

            </View>
            <View style={{ alignSelf: "flex-end", marginTop: 10 }}>
                {isSign ? <CustomClearButton title="CLEAR" onPress={handleClear} /> : null}
            </View>
        </>
    );
};

export default SignaturePad;

const styles = StyleSheet.create({
    signContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        height: 250,
        width: "100%",
        borderWidth: 1,
        borderColor: "#BBB7B7",
        borderRadius: 5,
        overflow: "hidden",
    },
    button: {
        width: 100,
        paddingHorizontal: 20,
        alignItems: "center",
        paddingVertical: 5,
        borderRadius: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1.5,
        shadowRadius: 2,
        elevation: 5,
    },
    buttonText: {
        fontFamily: FONT_FAMILY.urbanistBold,
        textAlign: "center",
        fontSize: 12,
        color: COLORS.white,
    },
    label: {
        marginVertical: 5,
        fontSize: 16,
        color: "#2e2a4f",
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
    preview: {
        width: 335,
        height: 114,
        backgroundColor: "#F8F8F8",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 15,
    },
});
// 