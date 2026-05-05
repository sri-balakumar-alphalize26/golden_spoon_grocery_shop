import React from 'react'
import { RoundedScrollContainer } from '@components/containers'
import { TouchableOpacity, Image, Linking } from 'react-native'
import { COLORS } from '@constants/theme';

const WatsAppHistory = () => {

    const openWhatsApp = () => {
        // Replace 'whatsapp://send?phone=1234567890' with the desired WhatsApp phone number
        Linking.openURL('whatsapp://send?phone=');
    };

    return (
        <RoundedScrollContainer>
            <TouchableOpacity onPress={openWhatsApp} style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}>
                <Image source={require('@assets/icons/common/watsapp.png')} style={{ width: 35, height: 35 }} />
            </TouchableOpacity>
        </RoundedScrollContainer>
    )
}

export default WatsAppHistory