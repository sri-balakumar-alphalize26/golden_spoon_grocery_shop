
import { StyleSheet, Platform } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const styles = StyleSheet.create({

  itemContainer: {
    marginHorizontal: 5,
    marginVertical: 5,
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
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
  },
  totalItemsText: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginVertical: 8,
  },
  productContainer: {
    borderWidth: 0.8,
    borderColor: '#ccc',
    borderStyle:'dotted',
    borderRadius: 18,
    padding: 8,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageWrapper: {
    width: 80,
    height: 80,
    borderWidth: 0.8,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 16,
  },
  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  productDetails: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginBottom: 8,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  textInput: {
    width: 40,
    height: 30,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 4,
    textAlign: 'center',
    marginHorizontal: 8,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    marginRight: 8,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  aedLabel: {
    fontSize: 14,
    marginLeft: 8,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
  },
  deleteButton: {
    padding: 8,
  },
  flatListContent: {
    paddingBottom: 10,
  },
  footerContainer: {
    padding: 10,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
  },
  totalPriceContainer: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 5, // Add vertical margin for spacing between rows
  },
  footerLabel: {
    fontSize: 16,
    color: COLORS.black,
    fontFamily:FONT_FAMILY.urbanistBold
  },
  totalPriceLabel: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBlack,
    marginTop: 10, // Add top margin for extra spacing if needed
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    alignItems: 'center',
  },
});


export default styles;
