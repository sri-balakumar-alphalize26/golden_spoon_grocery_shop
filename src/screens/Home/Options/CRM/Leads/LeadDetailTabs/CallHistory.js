import { RoundedScrollContainer } from '@components/containers';
import { TouchableOpacity, Image, Linking } from 'react-native';
import { COLORS } from '@constants/theme';

const CallHistory = () => {

    const openPhoneDialer = () => {
        Linking.openURL('tel:');
    };

    return (
        <RoundedScrollContainer>
            <TouchableOpacity onPress={openPhoneDialer} style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}>
                <Image source={require('@assets/icons/common/call_history.png')} style={{ width: 35, height: 35 }} />
            </TouchableOpacity>
        </RoundedScrollContainer>
    )
}

export default CallHistory