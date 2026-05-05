import React from 'react';
import { View, StyleSheet } from 'react-native';
import Text from '@components/Text';
import Modal from 'react-native-modal';
import { Button } from '@components/common/Button';
// import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { NavigationHeader } from '@components/Header';

const RulesModal = ({ isVisible, onClose }) => {
    return (
        <Modal
            isVisible={isVisible}
            animationIn="bounceIn"
            animationOut="slideOutDown"
            backdropOpacity={0.7}
            animationInTiming={400}
            animationOutTiming={300}
            backdropTransitionInTiming={400}
            backdropTransitionOutTiming={300}
        >
            <View style={styles.modalContainer}>
                <NavigationHeader onBackPress={() => onClose()} title={'Rules'} />
                <View style={styles.modalContent}>
                    <Text style={styles.label}>Visits Plan Rules</Text>
                    <Text style={{ fontFamily: FONT_FAMILY.urbanistMedium }}>
                        <Text style={{ fontFamily: FONT_FAMILY.urbanistBold }}>1)</Text> An Employee Can Plan Visit for Upcoming Days but Send for Approval button is Enabled only for very next day visit Plan.{'\n'}
                        <Text style={{ fontFamily: FONT_FAMILY.urbanistBold }}>2)</Text> Visit Plan Can be Created through Customers in Projection Progress, and it should be based on their Stats.{'\n'}
                        <Text style={{ fontFamily: FONT_FAMILY.urbanistBold }}>3)</Text> There has to be atleast 8 visit plans for the employee to send for approval, Out of Six has to be Mandatorily Visited.{'\n'}
                        <Text style={{ fontFamily: FONT_FAMILY.urbanistBold }}>4)</Text> Demo Visits are Exempted from the 8 count restriction.
                    </Text>
                    <View style={styles.buttonRow}>
                        <View style={{ flex: 3 }}>
                            <Button title="Ok" onPress={() => onClose()} />
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: 'white',
        padding: 20,
        // borderRadius: 10,
        borderBottomRightRadius: 10,
        borderBottomLeftRadius: 10,
        width: '100%',
    },
    modalHeader: {
        fontSize: 18,
        fontFamily: FONT_FAMILY.urbanistMedium,
        marginBottom: 10,
    },
    textInput: {
        borderWidth: 1,
        borderColor: 'gray',
        marginBottom: 10,
        padding: 10,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
        borderRadius: 5,
    },
    textInputError: {
        borderColor: 'red',
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        // marginBottom: 10,
    },
    errorText: {
        color: 'red',
        marginLeft: 10,
    },
    buttonRow: {
        flexDirection: 'row',
    },
    button: {
        borderRadius: 10,
    },
    label: {
        // flex: 1,
        marginVertical: 5,
        fontSize: 16,
        color: COLORS.primaryThemeColor,
        fontFamily: FONT_FAMILY.urbanistBlack,
    },
});

export default RulesModal;
