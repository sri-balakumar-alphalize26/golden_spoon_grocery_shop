import React from 'react'
import { FlatList } from 'react-native'
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView } from '@components/containers'
import { ListItem } from '@components/Options';
import { formatData } from '@utils/formatters';
import { EmptyItem } from '@components/common/empty';
import { COLORS } from '@constants/theme';

const SpareManagementsScreen = ({ navigation }) => {

    const options =
        [
            { title: 'Spare Parts Request', image: require('@assets/images/Home/section/spare.png'), onPress: () => navigation.navigate('SparePartsRequestScreen') },
            // { title: 'Spare Parts Issues', image: require('@assets/images/Home/options/crm/lead.png'), onPress: () => navigation.navigate('') },
            // { title: 'Spare Parts Return', image: require('@assets/images/Home/options/crm/pipeline.png'), onPress: () => navigation.navigate('') },
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
                title="Configurations"
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

export default SpareManagementsScreen