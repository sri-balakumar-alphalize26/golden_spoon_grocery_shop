import React, { useState } from 'react';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import Text from '@components/Text';
import { View, FlatList } from 'react-native';
import { COLORS } from '@constants/theme';
import { DetailField } from '@components/common/Detail';
import { EmptyState } from '@components/common/empty';
import { formatDate } from '@utils/common/date';
import InventoryBoxList from './InventoryBoxList';
import { styles } from './styles';
import { reasons } from '@constants/dropdownConst';
import { CustomListModal } from '@components/Modal';

const InventoryDetails = ({ navigation, route }) => {
  const { inventoryDetails } = route?.params || {};
  const [isVisible, setIsVisible] = useState(false)
    
  const renderItem = ({ item }) => {
    if (item.empty) return <EmptyItem />;
    return <InventoryBoxList item={item} />;
  };

  const renderEmptyState = () => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty_inventory_box.png')} message="Box items is empty" />
  );

  const renderContent = () => (
    <FlatList
      data={inventoryDetails?.items || []}
      numColumns={1}
      renderItem={renderItem}
      keyExtractor={(item, index) => index.toString()}
      showsVerticalScrollIndicator={false}
      estimatedItemSize={100}
    />
  );

  const handleBoxOpeningRequest = (value) => {
    if (value) {
      navigation.navigate('InventoryForm', {
        items: inventoryDetails?.items || [],
        boxId: inventoryDetails?._id,
        boxName: inventoryDetails?.name,
        reason: value
      });
    } return null;
  };


  return (
    <SafeAreaView>
      <NavigationHeader onBackPress={() => navigation.goBack()} title="Inventory Details" />
      <RoundedScrollContainer>
        <DetailField label="Inventory Box" value={inventoryDetails?.name} labelColor={COLORS.boxTheme} />
        <DetailField label="Warehouse" value={inventoryDetails?.warehouse_name} labelColor={COLORS.boxTheme} />
        <DetailField label="Date" value={formatDate(inventoryDetails?.date, 'yyyy-MM-dd hh:mm a')} labelColor={COLORS.boxTheme} />
        <View style={{ marginVertical: 10 }} />
        <Text style={styles.label}>Box Items</Text>
        {inventoryDetails?.items?.length === 0 ? renderEmptyState() : renderContent()}
        {/* {hasPermission() ? (
          <ButtonContainer>
            <Button title="Box Opening Request" backgroundColor={COLORS.boxTheme} onPress={() => setIsVisible(true)} />
          </ButtonContainer>
        ) : (
          <Text style={styles.notification}>You do not have permission to open the box request</Text>
        )} */}
        {/* <Button title="Box Opening Request" backgroundColor={COLORS.boxTheme} onPress={() => setIsVisible(true)} /> */}
        <CustomListModal
          isVisible={isVisible}
          items={reasons}
          title={'Select Reason'}
          onClose={() => setIsVisible(false)}
          onValueChange={handleBoxOpeningRequest}
        />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default InventoryDetails;
