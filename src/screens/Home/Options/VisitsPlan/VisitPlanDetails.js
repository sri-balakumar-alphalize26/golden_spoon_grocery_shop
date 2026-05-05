import React, { useState, useCallback } from 'react';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { useFocusEffect } from '@react-navigation/native';
import { DetailField } from '@components/common/Detail';
import { formatDateTime } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchVisitPlanDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';
import { LoadingButton } from '@components/common/Button';
import { ConfirmationModal } from '@components/Modal';
import { put } from '@api/services/utils';
import { showToast } from '@utils/common';
import { useAuthStore } from '@stores/auth';
import { NavigationHeader } from '@components/Header';

const VisitPlanDetails = ({ navigation, route }) => {

  const { id } = route?.params
  const currentUser = useAuthStore(state => state.user)
  const [details, setDetails] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);
  const [showButton, setShowButton] = useState({
    approveButton: false,
    visitButton: false,
  })

  const fetchDetails = async (id) => {
    setIsLoading(true);
    try {
      const [updatedDetails] = await fetchVisitPlanDetails(id);
      setDetails(updatedDetails);
      setShowButton({
        approveButton: updatedDetails?.approval_status === 'Pending' && currentUser?.related_profile?._id === updatedDetails?.visit_employee_manager_id,
        visitButton: updatedDetails?.approval_status === 'Approved' && updatedDetails?.visit_status === 'Not visited' && currentUser?.related_profile?._id === updatedDetails?.visit_employee_id,
      });
    } catch (error) {
      console.error('Error fetching enquiry details:', error);
      showToastMessage('Failed to fetch enquiry details. Please try again.');
    } finally {
      setIsLoading(false)
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (id) {
        fetchDetails(id);
      }
    }, [id])
  );

  const updateApprovalStatus = async () => {
    setIsConfirmationModalVisible(false);
    const visitPlanUpdateData = {
      visit_plan_id: id,
      approval_status: 'Approved'
    };
    try {
      const response = await put('/updateVisitPlan', visitPlanUpdateData);
      if (response.success) {
        showToast({ type: 'success', message: response.message, title: 'Success' });
      } else {
        showToast({ type: 'error', message: response.message, title: 'Error' });
      }
    } catch (error) {
      console.error('Error updating approval status:', error);
    } finally {
      setIsConfirmationModalVisible(false);
      fetchDetails(id)
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Visit Plan Details"
        onBackPress={() => navigation.goBack()}
        logo={false}
      // iconOneName="edit"
      // iconOnePress={() => { navigation.navigate('EditVisitPlan', { visitPlanId: id }) }}
      />

      <RoundedScrollContainer>
        <DetailField label="Visit Date" value={formatDateTime(details?.visit_date)} />
        <DetailField multiline label="Customer Name" value={details?.customer_name?.trim() || '-'} />
        <DetailField label="Assigned To" value={details?.visit_employee_name || '-'} />
        <DetailField label="Created By" value={details?.sales_person_name || '-'} />
        <DetailField label="Approval Status" value={details?.approval_status || '-'} />
        <DetailField label="Visit Purpose" value={details?.purpose_of_visit_name || '-'} />
        <DetailField label="Visit Status" value={details?.visit_status || '-'} />
        <DetailField
          label="Remarks"
          value={details?.remarks || '-'}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
        {showButton.approveButton &&
          <LoadingButton
            width="50%"
            alignSelf="center"
            marginVertical={50}
            title="Approve"
            onPress={() => setIsConfirmationModalVisible(true)}
          />}
        {showButton.visitButton &&
          <LoadingButton
            width="50%"
            alignSelf="center"
            marginVertical={50}
            title="New Visit"
            onPress={() => navigation.navigate('VisitForm', { visitPlanId: id })}
          />}
        <OverlayLoader visible={isLoading} />
        <ConfirmationModal
          headerMessage='Are you sure want to Approve'
          isVisible={isConfirmationModalVisible}
          onCancel={() => setIsConfirmationModalVisible(false)}
          onConfirm={updateApprovalStatus}
        />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default VisitPlanDetails;
