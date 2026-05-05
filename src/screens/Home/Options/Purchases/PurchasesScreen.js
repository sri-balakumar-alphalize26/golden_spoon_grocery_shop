import React from 'react'
import { FlatList } from 'react-native'
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView } from '@components/containers'
import { ListItem } from '@components/Options';
import { formatData } from '@utils/formatters';
import { EmptyItem } from '@components/common/empty';
import { COLORS } from '@constants/theme';

const PurchasesScreen = ({ navigation }) => {

    const options =
        [
            { title: 'Purchase Requisition', image: require('@assets/images/Home/options/buy.png'), onPress: () => navigation.navigate('PurchaseRequisitionScreen') },
            { title: 'Price Enquiry', image: require('@assets/images/Home/options/price_enquiry.png'), onPress: () => {
                console.log('Navigating to PriceEnquiryScreen');
                navigation.navigate('PriceEnquiryScreen');
            } },
            { title: 'Purchase Order', image: require('@assets/images/Home/options/PurchaseOrder.png'), onPress: () => navigation.navigate('PurchaseOrderScreen') },
            { title: 'Delivery Note', image: require('@assets/images/Home/options/DeliveryNote.png'), onPress: () => navigation.navigate('DeliveryNoteScreen') },
            { title: 'Vendor Bill', image: require('@assets/images/Home/options/payment.png'), onPress: () => navigation.navigate('VendorBillScreen') },
            { title: 'Supplier Payment', image: require('@assets/images/Home/options/supplierPayment.png'), onPress: () => navigation.navigate('SupplierPaymentScreen') },
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
                title="Purchases"
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

export default PurchasesScreen