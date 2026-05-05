// src/api/utils.js
import axios from 'axios';
import { API_BASE_URL } from '@api/config';
import handleApiError from '../utils/handleApiError';



export const get = async (endpoint, params = {}) => {
  try {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    console.log('API request:', url, 'with params:', params);
    const response = await axios.get(url, { params });
    return response.data;
  } catch (error) {
    handleApiError(error)
  }
};


export const post = async (endpoint, data = {}, config ={}) => {
  try {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    // console.log('API request:', url, 'with data:', data); 
    const response = await axios.post(url, data, config);
    return response.data;
  } catch (error) {
    handleApiError(error)
  }
};



export const put = async (endpoint, data = {}, config ={}) => {
  try {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    // console.log('API request:', url, 'with data:', data); 
    const response = await axios.put(url, data, config);
    return response.data;
  } catch (error) {
    handleApiError(error)
  }
};


export const deleteRequest = async (endpoint, data = {}, config = {}) => {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    // For DELETE requests with data in the body, axios requires { data: data } in the config
    const response = await axios.delete(url, { data, ...config });
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
};

// Simple demo function to fetch inventory box details directly
export const fetchInventoryBoxDemo = async () => {
  try {
    const url = 'https://4d0c42359e62.ngrok-free.app/api/view_inventory_box';
    console.log('Calling InventoryBoxDemo API:', url);
    const response = await axios.get(url);
    console.log('InventoryBoxDemo API response:', response.data);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

