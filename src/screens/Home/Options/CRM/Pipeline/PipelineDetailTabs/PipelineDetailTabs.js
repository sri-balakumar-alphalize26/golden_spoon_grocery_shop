import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useState } from 'react';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { CustomTabBar } from '@components/TabBar';
import FollowUp from './FollowUp';
import CustomerVisit from './CustomerVisit';
import EmailHistory from './EmailHistory';
import CallHistory from './CallHistory';
import WhatsAppHistory from './WhatsAppHistory';
import Meetings from './Meetings';
import Details from './Details';

const PipelineDetailTabs = ({ navigation, route }) => {

  const { id } = route?.params || {};
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'first', title: 'Details' },
    { key: 'second', title: 'Follow Up' },
    { key: 'third', title: 'Customer Visit' },
    { key: 'fourth', title: 'Email History' },
    { key: 'fifth', title: 'Call History' },
    { key: 'sixth', title: 'Whatsapp History' },
    { key: 'seventh', title: 'Meetings' },
  ]);

  const renderScene = ({ route }) => {
    switch (route.key) {
      case 'first':
        return <Details pipelineId={id} />;
      case 'second':
        return <FollowUp pipelineId={id} />;
      case 'third':
        return <CustomerVisit pipelineId={id} navigation={navigation}/>;
      case 'fourth':
        return <EmailHistory pipelineId={id} />;
      case 'fifth':
        return <CallHistory pipelineId={id} />;
      case 'sixth':
        return <WhatsAppHistory pipelineId={id} />;
      case 'seventh':
        return <Meetings pipelineId={id} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Pipeline Details"
        onBackPress={() => navigation.goBack()}
        logo={false}
        iconOneName='edit'
        iconOnePress={() => navigation.navigate('EditPipeline', { pipelineId: id })}
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

export default PipelineDetailTabs;
