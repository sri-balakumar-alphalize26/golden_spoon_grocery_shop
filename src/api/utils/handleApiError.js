// handleApiError.js
const handleApiError = (error) => {
    console.log('API error api-utils: ', error);
    throw error;
  };
  
  export default handleApiError;
  