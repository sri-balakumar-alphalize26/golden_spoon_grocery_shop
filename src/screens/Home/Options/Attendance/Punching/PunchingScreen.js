// PunchingScreen.js
import React, { useState } from 'react';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { CalendarScreen } from '@components/Calendar';
import { format } from 'date-fns';

const PunchingScreen = ({ navigation }) => {
    const [selectedDay, setSelectedDay] = useState(new Date());

    const handleDayPress = (day) => {
        const selectedDate = new Date(day.timestamp);
        setSelectedDay(selectedDate);
    };

    const formattedSelectedDay = format(selectedDay, 'yyyy-MM-dd');

    return (
        <SafeAreaView>
            <NavigationHeader
                title="Punching"
                onBackPress={() => navigation.goBack()}
                logo={false}
                iconOneName={'check'}
                iconOnePress={() => navigation.navigate('MarkAttendance', { date: formattedSelectedDay })}
            />
            <RoundedContainer>
                <CalendarScreen onDayPress={handleDayPress} />
            </RoundedContainer>
        </SafeAreaView>
    );
};

export default PunchingScreen;
