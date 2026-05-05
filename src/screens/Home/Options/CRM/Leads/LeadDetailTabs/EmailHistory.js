import React from 'react'
import { RoundedScrollContainer } from '@components/containers'
import { TouchableOpacity, Image, Linking } from 'react-native';
import { COLORS } from '@constants/theme';

const EmailHistory = () => {

    // Function to open Gmail
    const openGmail = () => {
        Linking.openURL('mailto:example@gmail.com');
    };

    return (
        <RoundedScrollContainer>
            <TouchableOpacity onPress={openGmail} style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}>
                <Image source={require('@assets/icons/common/gmail_history.png')} style={{ width: 35, height: 35 }} />
            </TouchableOpacity>
        </RoundedScrollContainer>
    )
}

export default EmailHistory