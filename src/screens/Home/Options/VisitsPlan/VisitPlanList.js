import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY } from '@constants/theme';
import { formatDate } from '@utils/common/date';

const VisitPlanList = ({ item, onPress }) => {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.itemContainer}>
      <View style={styles.leftColumn}>
        <Text style={styles.head}>{item?.customer_name?.trim() || '-'}</Text>
        <View style={styles.rightColumn}>
          <Text style={styles.content}>{item?.visit_employee_name || '-'}</Text>
          <Text style={[styles.contentRight]}>{formatDate(item?.visit_date, 'dd MMM yyyy HH:mm:ss ') || '-'}</Text>
        </View>
      </View>
      <View style={styles.rightColumn}>
        <Text style={styles.content}>{item?.purpose_of_visit_name || '-'}</Text>
        <Text style={styles.contentRight}>{item?.approval_status || '-'}</Text>
      </View>
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
  leftColumn: {
    flex: 1,
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
    textTransform:'capitalize'
  },
 
  contentRight: {
    color: '#666666',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    fontSize:14,
  },
});

export default VisitPlanList;
