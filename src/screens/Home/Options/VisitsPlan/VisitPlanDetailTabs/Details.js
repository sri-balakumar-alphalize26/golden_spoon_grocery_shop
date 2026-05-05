import React, { useState, useCallback } from 'react';
import { RoundedScrollContainer } from '@components/containers';
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

const Details = ({ visitPlanId }) => {

  const currentUser = useAuthStore(state => state.user)
  const [details, setDetails] = useState({});
  console.log("🚀 ~ file: Details.js:19 ~ Details ~ details:", JSON.stringify(details, null, 2))
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);

  const fetchDetails = async (visitPlanId) => {
    setIsLoading(true);
    try {
      const updatedDetails = await fetchVisitPlanDetails(visitPlanId);
      setDetails(updatedDetails[0]);
    } catch (error) {
      console.error('Error fetching enquiry details:', error);
      showToastMessage('Failed to fetch enquiry details. Please try again.');
    } finally {
      setIsLoading(false)
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (visitPlanId) {
        fetchDetails(visitPlanId);
      }
    }, [visitPlanId])
  );


  const updateApprovalStatus = async () => {
    setIsConfirmationModalVisible(false);
    const visitPlanUpdateData = {
      visit_plan_id: visitPlanId,
      approval_status: 'Approved'
    };
    console.log("🚀 ~ file: Details.js:50 ~ updateApprovalStatus ~ visitPlanUpdateData:", visitPlanUpdateData)
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
      fetchDetails(visitPlanId)
    }
  };


  const shouldShowApprovalButton = () => {
    return details?.approval_status === 'Pending' && currentUser._id === details?.visit_employee_manager_id;
  };

  return (
    <RoundedScrollContainer>
      <DetailField label="Visit Date" value={formatDateTime(details?.visit_date)} />
      <DetailField multiline label="Customer Name" value={details?.customer_name?.trim() || '-'} />
      <DetailField label="Assigned To" value={details?.visit_employee_name || '-'} />
      <DetailField label="Created By" value={details?.sales_person_name || '-'} />
      <DetailField label="Approval Status" value={details?.approval_status || '-'} />
      <DetailField label="Visit Purpose" value={details?.purpose_of_visit_name || '-'} />
      <DetailField
        label="Remarks"
        value={details?.remarks || '-'}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />

      {shouldShowApprovalButton() && <LoadingButton
        width="50%"
        alignSelf="center"
        marginVertical={50}
        title={'Approve'}
        onPress={() => setIsConfirmationModalVisible(true)}
      />}
      <OverlayLoader visible={isLoading} />
      <ConfirmationModal
        isVisible={isConfirmationModalVisible}
        onCancel={() => setIsConfirmationModalVisible(false)}
        onConfirm={updateApprovalStatus}
      />
    </RoundedScrollContainer>
  );
};

export default Details;
