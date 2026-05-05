import React, { useState, useEffect, useRef } from 'react';
import {
    StyleSheet,
    TouchableOpacity,
    View,
    ScrollView,
    Dimensions
} from 'react-native';
import { format, isSameDay, addDays, subDays } from 'date-fns';
import Text from '@components/Text';
import { FONT_FAMILY } from '@constants/theme';

const VerticalScrollableCalendar = ({ date, onChange }) => {
    const itemWidth = 60; // Adjust this value based on your item width
    const visibleDays = 31; // Number of days to display in a full month
    const scrollViewRef = useRef(null);
    const [scrollX, setScrollX] = useState(0);

    useEffect(() => {
        // Calculate the initial start date to center on the selected date
        const initialScrollX = Math.floor(visibleDays / 2) * itemWidth;
        scrollViewRef.current.scrollTo({ x: initialScrollX, animated: false });
        setScrollX(initialScrollX);
    }, [date]);

    const handleScroll = (event) => {
        const contentOffsetX = event.nativeEvent.contentOffset.x;
        setScrollX(contentOffsetX);
    };

    const centeredIndex = Math.round(scrollX / itemWidth);
    const centeredDate = addDays(subDays(date, Math.floor(visibleDays / 2)), centeredIndex);

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                ref={scrollViewRef}
                onScroll={handleScroll}
                snapToInterval={itemWidth}
                decelerationRate="fast"
                style={styles.scrollView}
                centerContent={true}
                contentContainerStyle={styles.contentContainer}
                showsHorizontalScrollIndicator={false}
            >
                {Array.from({ length: visibleDays }, (_, index) => {
                    const day = addDays(subDays(date, Math.floor(visibleDays / 2)), index);

                    const textStyles = [styles.label];
                    const touchable = [styles.touchable];

                    const sameDay = isSameDay(day, centeredDate);
                    if (sameDay) {
                        textStyles.push(styles.selectedLabel);
                        touchable.push(styles.selectedTouchable);
                    }
                    const screenWidth = Dimensions.get('window').width;
                    const marginRight = (screenWidth / 25.9);

                    return (
                        <View key={format(day, 'yyyy-MM-dd')} style={{ backgroundColor: 'white', marginHorizontal: 0, justifyContent: 'center', marginRight: marginRight }}>
                            <TouchableOpacity
                                onPress={() => onChange(day)}
                                style={touchable}
                            >
                                <Text style={sameDay ? styles.selectedDayOfWeek : styles.dayOfWeek}>{format(day, 'EEE')}</Text>
                                <Text style={sameDay ? styles.selectedDayText : styles.dayText}>{format(day, 'dd')}</Text>
                                <Text style={sameDay ? styles.selectedMonthText : styles.dayOfMonth}>{format(day, 'MMM')}</Text>
                            </TouchableOpacity>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};


const styles = StyleSheet.create({
    container: {
        paddingBottom: 0// you can adjust the values 10 or 25
    },
    scrollView: {
        paddingHorizontal: 10,
    },
    contentContainer: {
        flexDirection: 'row',
    },
    dayText: {
        color: '#32274D', // Set text color for non-selected dates to black
        // marginBottom: 5,
        fontSize: 14, // Set font size for non-selected dates to 14
        fontFamily: FONT_FAMILY.urbanistMedium,
    },

    selectedDayText: {
        color: 'white',
        // marginBottom: 5,
        fontSize: 20,
        fontFamily: FONT_FAMILY.urbanistBold,
    },
    selectedMonthText: {
        color: 'white',
        marginBottom: 0,
        fontSize: 10,
        fontFamily: FONT_FAMILY.urbanistBold,
    },
    label: {
        fontSize: 14,
        color: '#32274D',
        textAlign: 'center',
    },
    selectedLabel: {
        color: 'white',
        // fontWeight: 'bold',
        fontFamily: FONT_FAMILY.urbanistMedium
    },
    touchable: {
        borderRadius: 10,
        alignItems: 'center',
        width: 55,
        height: 53,
        padding: 5,
        backgroundColor: "#F9D7BF",
    },

    selectedTouchable: {
        backgroundColor: '#F37021',
        width: 65,
        height: 63,
        paddingTop: 10,
        elevation: 5,
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
    },
    dayOfWeek: {
        color: '#32274D',
        marginBottom: 0,
        fontSize: 10,
        fontFamily: FONT_FAMILY.urbanistMedium
    },
    dayOfMonth: {
        color: '#32274D',
        marginBottom: 10,
        fontSize: 10,
        fontFamily: FONT_FAMILY.urbanistMedium
    },
    selectedDayOfWeek: {
        color: 'white',
        marginBottom: 0,
        fontSize: 10,
        fontFamily: FONT_FAMILY.urbanistBold
    },
});

export default VerticalScrollableCalendar;