import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useState } from 'react';
import Details from './Details';
import CustomerVisit from './CustomerVisit';
import { SafeAreaView } from '@components/containers';
import NavigationHeader from '@components/Header/NavigationHeader';
import { CustomTabBar } from '@components/TabBar';

const VisitPlanDetailTabs = ({ navigation, route }) => {
  const { id } = route?.params || {};
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'first', title: 'Details' },
    { key: 'second', title: 'Customer Visit' },
  ]);

  const renderScene = ({ route }) => {
    switch (route.key) {
      case 'first':
        return <Details visitPlanId={id} />;
      case 'second':
        return <CustomerVisit visitPlanId={id} navigation={navigation} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Visit Plan Details"
        onBackPress={() => navigation.goBack()}
        logo={false}
        iconOneName="edit"
        iconOnePress={() => { navigation.navigate('EditVisitPlan', { visitPlanId: id }) }}
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

export default VisitPlanDetailTabs;
