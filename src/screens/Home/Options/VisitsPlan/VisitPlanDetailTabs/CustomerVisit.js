import React from 'react';
import { RoundedScrollContainer } from '@components/containers';
import { FABButton } from '@components/common/Button';

const CustomerVisit = ({ visitPlanId, navigation }) => {
    return (
        <RoundedScrollContainer paddingHorizontal={0}>
            <FABButton onPress={() => navigation.navigate('VisitForm', { visitPlanId: visitPlanId })} />
        </RoundedScrollContainer>
    );
};

export default CustomerVisit;
