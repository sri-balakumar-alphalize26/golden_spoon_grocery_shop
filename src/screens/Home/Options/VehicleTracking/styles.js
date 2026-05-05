import { StyleSheet, Platform } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';

export const vehicleTrackingStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  calendarContainer: {
    marginBottom: 20,
  },
  calendar: {
    borderRadius: 10,
    ...Platform.select({
      android: {
        elevation: 2,
      },
      ios: {
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
    }),
  },
  contentContainer: {
    flex: 1,
    minHeight: 300,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: COLORS.red,
    textAlign: 'center',
  },
  imageUploadContainer: {
    marginVertical: 15,
    alignItems: 'flex-start',
  },
  imagePickerButton: {
    width: 80,
    height: 80,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  imagePickerIcon: {
    fontSize: 24,
    color: 'white',
    position: 'absolute',
    top: 8,
    right: 8,
  },
  imagePickerText: {
    fontSize: 32,
    color: 'white',
    fontWeight: 'bold',
  },
});