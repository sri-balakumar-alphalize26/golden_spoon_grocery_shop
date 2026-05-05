import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY } from '@constants/theme';
import { formatDate } from '@utils/common/date';

const PickupList = ({ item, onPress }) => {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
      <View style={styles.rightColumn}>
        <Text style={styles.head}>{item?.sequence_no || '-'}</Text>
      </View>
      <View style={styles.rightColumn}>
        <Text style={[styles.contentRight]}>{formatDate(item?.date_time) || '-'}</Text>
        <Text style={styles.content}>{item?.device_name}</Text>
      </View>
      <View style={styles.rightColumn}>
        <Text style={styles.content}>{item?.sales_person_name}</Text>
        <Text style={styles.content}>{item?.warehouse_name}</Text>
      </View>
      <View style={styles.rightColumn}>
        <Text style={[styles.content, { color: 'red' }]}>{item?.job_stage || '-'}</Text>
      </View>
      <View style={styles.rightColumn}>
        <Text style={styles.content}>{item?.customer_name?.trim() || '-'}</Text>
      </View>
      {/* <View style={styles.rightColumn}>
        {item?.job_registration?.map((job, index) => (
          <Text key={index} style={[styles.contentRight, { color: 'red' }]}>{job?.job_stage || '-'}</Text> ))}
      </View> */}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    marginHorizontal: 5,
    marginVertical: 5,
    backgroundColor: 'white',
    borderRadius: 15,
    ...Platform.select({
      android: {
        elevation: 4,
      },
      ios: {
        shadowColor: 'black',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
      },
    }),
    padding: 20,
  },
  rightColumn: {
    justifyContent: 'space-between', 
    flexDirection: 'row', 
    flex: 1 
  },
  head: {
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 17,
    marginBottom: 5,
  },
  content: {
    color: '#666666',
    marginBottom: 5,
    fontSize:14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    textTransform:'capitalize',
  },
  contentRight: {
    color: '#666666',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize:14,
  },
});

export default PickupList;
