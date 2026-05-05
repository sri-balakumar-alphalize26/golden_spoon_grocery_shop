// styles.js
import { COLORS } from '@constants/theme';
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  itemInvisible: {
    backgroundColor: 'transparent',
  },
  itemStyle: {
    flex: 1,
    alignItems: 'center',
    margin: 6,
    borderRadius: 8,
    marginTop: 5,
    backgroundColor:COLORS.white,
  },
});

export default styles;
