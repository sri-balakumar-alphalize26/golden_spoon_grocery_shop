import React, { useState, useCallback } from 'react';
import { View } from 'react-native';
import { RoundedScrollContainer } from '@components/containers';
import { useFocusEffect } from '@react-navigation/native';
import { DetailField } from '@components/common/Detail';
import { formatDateTime } from '@utils/common/date';
import { showToastMessage } from '@components/Toast';
import { fetchPipelineDetails } from '@api/details/detailApi';
import { OverlayLoader } from '@components/Loader';
import { PressableInput } from '@components/common/Button';
import { CustomListModal } from '@components/Modal';
import { actions } from '@constants/dropdownConst';
import { put } from '@api/services/utils';

const Details = ({ pipelineId }) => {
  const [details, setDetails] = useState({});
  const [isLoading, setIsLoading] = useState(false)
  const [isVisibleModal, setIsVisibleModal] = useState(false)

  const fetchDetails = async (pipelineId) => {
    setIsLoading(true);
    try {
      const updatedDetails = await fetchPipelineDetails(pipelineId);
      setDetails(updatedDetails[0]);
    } catch (error) {
      console.error('Error fetching pipeline details:', error);
      showToastMessage('Failed to fetch pipeline details. Please try again.');
    } finally {
      setIsLoading(false)
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (pipelineId) {
        fetchDetails(pipelineId);
      }
    }, [pipelineId])
  );
  const handleUpdateStatus = async (status) => {
    if (status) {
      try {
        const pipelineUpdates = {
          pipeline_id: pipelineId,
          status: status.value,
        };
        await put('/updatePipeline', pipelineUpdates);
        showToastMessage('Status updated successfully');
      } catch (error) {
        console.log("API Error:", error);
      } finally {
        fetchDetails(pipelineId);
      }
    }
  };

  return (
    <RoundedScrollContainer>
      <View style={{ marginBottom: 10, width: '30%', alignSelf: 'flex-end' }}>
        <PressableInput
          placeholder="Actions"
          dropIcon={"menu-down"}
          handlePress={() => setIsVisibleModal(!isVisibleModal)}
        />
      </View>
      <DetailField label="Date & Time" value={formatDateTime(details.date)} />
      <DetailField label="Customer" value={details?.customer?.name?.trim() || '-'} multiline />
      <DetailField label="Status" value={details?.status || '-'} />
      <DetailField label="Source" value={details?.source?.source_name || '-'} />
      <DetailField label="Enquiry Type" value={details?.enquiry?.enquiry_name || '-'} />
      <DetailField label="Sales Person" value={details?.employee?.employee_name || '-'} />
      <DetailField label="Opportunity" value={details?.oppertunity?.oppertunity_name || '-'} />
      <DetailField
        label="Remarks"
        value={details?.remarks || '-'}
        multiline
        numberOfLines={5}
        textAlignVertical={'top'}
      />
      <OverlayLoader visible={isLoading} />
      <CustomListModal
        onAddIcon={false}
        title={'Actions'}
        items={actions}
        isVisible={isVisibleModal}
        onValueChange={handleUpdateStatus}
        onClose={() => setIsVisibleModal(!isVisibleModal)}
      />
    </RoundedScrollContainer>
  );
};

export default Details;
