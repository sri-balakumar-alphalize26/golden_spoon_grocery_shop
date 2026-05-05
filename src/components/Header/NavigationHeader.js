import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { AntDesign, Feather } from '@expo/vector-icons';

const NavigationHeader = ({
    title,
    onBackPress,
    color = COLORS.white,
    backgroundColor = COLORS.primaryThemeColor,
    logo = false,
    iconOneName,
    iconOnePress,
    iconTwoName,
    iconTwoPress,
    iconThreeName,
    iconThreePress,
    refreshIcon = false,
    refreshPress = () => { },
    checkIcon = false,
    checkPress = () => { }
}) => {

    const logoSource = backgroundColor === COLORS.primaryThemeColor
        ? require('@assets/images/header/transparent_logo_header.png')
        : require('@assets/images/header/logo_header_bg_white.png');

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <TouchableOpacity onPress={onBackPress} style={styles.goBackContainer}>
                <AntDesign name="left" size={20} color={color} />
            </TouchableOpacity>
            <Text style={[styles.title, { color }]}>{title}</Text>
            {logo && <Image source={logoSource} style={styles.logoImage} />}
            {iconOneName &&
                <TouchableOpacity activeOpacity={0.8} onPress={iconOnePress}>
                    <AntDesign name={iconOneName} size={25} color={color} />
                </TouchableOpacity>
            }
            <View style={{ width: 15 }} />
            {iconTwoName &&
                <TouchableOpacity activeOpacity={0.8} onPress={iconTwoPress}>
                    <AntDesign name={iconTwoName} size={25} color={color} />
                </TouchableOpacity>
            }
            <View style={{ width: 5 }} />

            {iconThreeName &&
                <TouchableOpacity activeOpacity={0.8} onPress={iconThreePress}>
                    <AntDesign name={iconThreeName} size={25} color={color} />
                </TouchableOpacity>
            }
            {checkIcon &&
                <TouchableOpacity activeOpacity={0.8} onPress={checkPress}>
                    <Feather name="check-circle" size={30} color={COLORS.orange} />
                </TouchableOpacity>
            }
            {refreshIcon &&
                <TouchableOpacity activeOpacity={0.8} onPress={refreshPress}>
                    <Image source={require('@assets/images/header/refresh_button.png')} style={styles.refreshImage} />
                </TouchableOpacity>
            }
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 15,
        paddingHorizontal: 15,
    },
    goBackContainer: {
        marginRight: 15,
    },
    title: {
        fontSize: 18,
        fontFamily: FONT_FAMILY.urbanistBold,
        flex: 1,
        paddingLeft: 10,
    },
    logoImage: {
        width: '30%',
        height: '150%',
        alignSelf:'flex-end' //last
    },
    refreshImage: {
        width: 30,
        height: 30,
        resizeMode: 'contain',
        tintColor: COLORS.white,
    },
});

export default NavigationHeader;
