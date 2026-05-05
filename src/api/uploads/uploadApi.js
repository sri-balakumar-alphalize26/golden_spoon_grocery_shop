import axios from 'axios';
import { post } from "@api/services/utils";

// Upload writing API with retry mechanism
const uploadApi = async (fileUri) => {

  const uploadFile = async (retryCount = 0) => {
    try {
      const formData = new FormData();
      const contentType = 'image/png';

      formData.append('file', {
        uri: fileUri,
        type: contentType,
        name: fileUri.split('/').pop(),
      });

      const config = {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 60000, // Increase timeout to 60 seconds
      };

      const response = await post('/fileUpload?folder_name=audit', formData, config);

      // Check if the response contains the expected data
      if (response && response.data) {
        const uploadUrl = response.data;
        return uploadUrl;
      } else {
        console.log('Upload failed. Unexpected API response:', response.data);
        return null;
      }
    } catch (error) {
      console.log('API error:', error);

      // Handle different error scenarios
      if (error.response) {
        console.log('Error response data:', error.response.data);
        console.log('Error response status:', error.response.status);
        console.log('Error response headers:', error.response.headers);
      } else if (error.request) {
        console.log('No response received:', error.request);
      } else {
        console.log('Error message:', error.message);
      }

      // Retry logic for transient network issues
      if ((error.message === 'Network Error' || error.code === 'ECONNABORTED') && retryCount < 3) {
        console.log(`Retrying upload due to network error... Attempt ${retryCount + 1}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount))); // Exponential backoff
        return uploadFile(retryCount + 1);
      }

      return null;
    }
  };

  return uploadFile();
};

export default uploadApi;
