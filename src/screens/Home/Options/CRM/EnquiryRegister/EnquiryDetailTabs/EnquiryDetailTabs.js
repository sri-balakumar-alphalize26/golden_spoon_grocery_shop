import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useState } from 'react';
import Details from './Details';
import FollowUp from './FollowUp';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { CustomTabBar } from '@components/TabBar';

const EnquiryDetailTabs = ({ navigation, route }) => {
  const { id } = route?.params || {};
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'details', title: 'Details' },
    { key: 'followUp', title: 'Follow Up' },
  ]);

  const renderScene = ({ route }) => {
    switch (route.key) {
      case 'details':
        return <Details enquiryId={id} />;
      case 'followUp':
        return <FollowUp enquiryId={id} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Enquiry Register Details"
        onBackPress={() => navigation.goBack()}
        logo={false}
        // iconOneName="edit"
        // iconOnePress={() => { navigation.navigate('EditEnquiryRegister', { enquiryId: id }) }}
        iconTwoName="plus"
        iconTwoPress={() => { navigation.navigate('LeadForm', { enquiryId: id }) }}
        iconThreeName="delete"
        iconThreePress={() => { }}
      />
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        renderTabBar={props => <CustomTabBar {...props} scrollEnabled={false} />}
        onIndexChange={setIndex}
        initialLayout={{ width: layout.width }}
      />
    </SafeAreaView>
  );
};

export default EnquiryDetailTabs;
