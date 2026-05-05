import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useState } from 'react';
import Details from './Details';
import FollowUp from './FollowUp';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { CustomTabBar } from '@components/TabBar';
import EmailHistory from './EmailHistory';
import CallHistory from './CallHistory';
import WhatsAppHistory from './WhatsAppHistory';

const LeadDetailTabs = ({ navigation, route }) => {
    const { id } = route?.params || {};
    const layout = useWindowDimensions();
    const [index, setIndex] = useState(0);
    const [routes] = useState([
        { key: 'first', title: 'Details' },
        { key: 'second', title: 'Follow Up' },
        { key: 'third', title: 'Email History' },
        { key: 'fourth', title: 'Call History' },
        { key: 'fifth', title: 'WhatsApp History' },
    ]);

    const renderScene = ({ route }) => {
        switch (route.key) {
            case 'first':
                return <Details leadId={id} />;
            case 'second':
                return <FollowUp leadId={id} />;
            case 'third':
                return <EmailHistory leadId={id} />;
            case 'fourth':
                return <CallHistory leadId={id} />;
            case 'fifth':
                return <WhatsAppHistory leadId={id} />;
            default:
                return null;
        }
    };

    return (
        <SafeAreaView>
            <NavigationHeader
                title="Lead Details"
                onBackPress={() => navigation.goBack()}
                logo={false}
                iconOneName='edit'
                iconOnePress={() => navigation.navigate('EditLead', { leadId: id })}
            />
            <TabView
                navigationState={{ index, routes }}
                renderScene={renderScene}
                renderTabBar={props => <CustomTabBar {...props} />}
                onIndexChange={setIndex}
                initialLayout={{ width: layout.width }}
            />
        </SafeAreaView>
    );
};

export default LeadDetailTabs;
