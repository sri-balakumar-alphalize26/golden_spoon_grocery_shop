import React from 'react'
import { FlatList } from 'react-native'
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView } from '@components/containers'
import { ListItem } from '@components/Options';
import { formatData } from '@utils/formatters';
import { EmptyItem } from '@components/common/empty';
import { COLORS } from '@constants/theme';

const ServicesScreen = ({ navigation }) => {

    const options =
        [
            { title: 'Service', image: require('@assets/images/Home/section/service.png'), onPress: () => navigation.navigate('ServiceScreens') },
            { title: 'Spare Managements', image: require('@assets/images/Home/section/spare_parts.png'), onPress: () => navigation.navigate('SpareManagementsScreen') },
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
                title="Services"
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

export default ServicesScreen