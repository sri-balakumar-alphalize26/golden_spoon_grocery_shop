import React from 'react'
import { FlatList } from 'react-native'
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView } from '@components/containers'
import { ListItem } from '@components/Options';
import { formatData } from '@utils/formatters';
import { EmptyItem } from '@components/common/empty';
import { COLORS } from '@constants/theme';

const ServiceScreens = ({ navigation }) => {

    const options =
        [
            { title: 'Quick Service', image: require('@assets/images/Home/section/quick_service.png'), onPress: () => navigation.navigate('QuickServiceScreen') },
            { title: 'Pick Up', image: require('@assets/images/Home/section/pickup.png'), onPress: () => navigation.navigate('PickupScreen') },
        ]

    const renderItem = ({ item }) => {
        if (item.empty) {
            return <EmptyItem />;
        }
        return <ListItem title={item.title} image={item.image} onPress={item.onPress} />;
    };


    return (
        <SafeAreaView backgroundColor={COLORS.white}>
            <NavigationHeader
                title="Service"
                color={COLORS.black}
                backgroundColor={COLORS.white}
                onBackPress={() => navigation.goBack()}
            />
            <RoundedContainer backgroundColor={COLORS.primaryThemeColor}>
                <FlatList
                    data={formatData(options, 2)}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: 15 }}
                    renderItem={renderItem}
                    numColumns={2}
                    keyExtractor={(item, index) => index.toString()}
                />
            </RoundedContainer>
        </SafeAreaView>
    )
}

export default ServiceScreens