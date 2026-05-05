// components/CalendarScreen.js
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { format } from 'date-fns';

const CalendarScreen = ({
    markedDates = {},
    onDayPress = () => { },
    theme = {},
    style = {},
}) => {
    const [selectedDate, setSelectedDate] = useState(null);
    const today = format(new Date(), 'yyyy-MM-dd'); // Current date

    const handleDayPress = (day) => {
        setSelectedDate(day.dateString);
        onDayPress(day);
    };

    // Combine provided markedDates with default dates
    const combinedMarkedDates = {
        [today]: {
            marked: true,
            dotColor: COLORS.orange,
            activeOpacity: 0,
        },
        ...(selectedDate && {
            [selectedDate]: {
                selected: true,
                marked: true,
                dotColor: COLORS.white,
                selectedDotColor: COLORS.red,
            },
        }),
        ...markedDates,
    };

    return (
        <Calendar
            onDayPress={handleDayPress}
            markedDates={combinedMarkedDates}
            theme={{
                backgroundColor: COLORS.white,
                calendarBackground: COLORS.white,
                textSectionTitleColor: COLORS.black,
                selectedDayBackgroundColor: COLORS.orange,
                selectedDayTextColor: COLORS.white,
                todayTextColor: COLORS.orange,
                dayTextColor: COLORS.black,
                dotColor: COLORS.orange,
                arrowColor: COLORS.orange,
                textDayFontFamily: FONT_FAMILY.urbanistSemiBold,
                textMonthFontFamily: FONT_FAMILY.urbanistBold,
                textDayHeaderFontFamily: FONT_FAMILY.urbanistSemiBold,
                ...theme,
            }}
            style={[styles.calendar, style]}
        />
    );
};

const styles = StyleSheet.create({
    calendar: {
        borderRadius: 20,
    },
});

export default CalendarScreen;
