import { View, Text } from 'react-native'
import React, { useState } from 'react'
import { RoundedContainer, SafeAreaView } from '@components/containers'
import { VerticalScrollableCalendar } from '@components/Calendar';
import { NavigationHeader } from '@components/Header';

const TaskManagerScreen = ({ navigation }) => {
    const [date, setDate] = useState(new Date());
    return (
        <SafeAreaView>
            <NavigationHeader
                title="Task Manager"
                onBackPress={() => navigation.goBack()}
            />
            <RoundedContainer>
                <View style={{ marginTop: 20 }} />
                <VerticalScrollableCalendar date={date} onChange={(newDate) => setDate(newDate)} />
            </RoundedContainer>
        </SafeAreaView>
    )
}

export default TaskManagerScreen