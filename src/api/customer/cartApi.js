import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, post, put, del } from '@api/services/utils';

// Local storage functions for cart persistence
export const saveCartToStorage = async (customerId, cartData) => {
  try {
    await AsyncStorage.setItem(`cart_${customerId}`, JSON.stringify(cartData));
  } catch (error) {
    console.error('Error saving cart to storage:', error);
  }
};

export const loadCartFromStorage = async (customerId) => {
  try {
    const savedCart = await AsyncStorage.getItem(`cart_${customerId}`);
    return savedCart ? JSON.parse(savedCart) : [];
  } catch (error) {
    console.error('Error loading cart from storage:', error);
    return [];
  }
};

export const clearCartFromStorage = async (customerId) => {
  try {
    await AsyncStorage.removeItem(`cart_${customerId}`);
  } catch (error) {
    console.error('Error clearing cart from storage:', error);
  }
};

// Future API functions for when backend is ready
export const fetchCustomerCartFromAPI = async (customerId) => {
  try {
    const response = await get(`/customers/${customerId}/cart`);
    return response.data || [];
  } catch (error) {
    console.error('Error fetching cart from API:', error);
    // Fallback to storage
    return await loadCartFromStorage(customerId);
  }
};

export const addToCustomerCartAPI = async (customerId, product) => {
  try {
    const response = await post(`/customers/${customerId}/cart/add`, {
      product_id: product.id,
      quantity: product.quantity,
      price: product.price,
      name: product.name,
      imageUrl: product.imageUrl,
      uom: product.uom
    });
    return response.data;
  } catch (error) {
    console.error('Error adding to cart via API:', error);
    throw error;
  }
};

export const updateCartItemAPI = async (customerId, productId, quantity, price) => {
  try {
    const response = await put(`/customers/${customerId}/cart/update/${productId}`, {
      quantity,
      price
    });
    return response.data;
  } catch (error) {
    console.error('Error updating cart item via API:', error);
    throw error;
  }
};

export const removeFromCartAPI = async (customerId, productId) => {
  try {
    const response = await del(`/customers/${customerId}/cart/remove/${productId}`);
    return response.data;
  } catch (error) {
    console.error('Error removing from cart via API:', error);
    throw error;
  }
};

export const confirmCartAPI = async (customerId, orderData) => {
  try {
    const response = await post(`/customers/${customerId}/cart/confirm`, orderData);
    return response.data;
  } catch (error) {
    console.error('Error confirming cart via API:', error);
    throw error;
  }
};

// Utility function to sync cart with backend (when available)
export const syncCartWithBackend = async (customerId, localCart) => {
  try {
    // Try to fetch from backend first
    const backendCart = await fetchCustomerCartFromAPI(customerId);
    
    // If backend has data, use it and update local storage
    if (backendCart && backendCart.length > 0) {
      await saveCartToStorage(customerId, backendCart);
      return backendCart;
    }
    
    // If backend is empty but local has data, sync to backend
    if (localCart && localCart.length > 0) {
      for (const item of localCart) {
        await addToCustomerCartAPI(customerId, item);
      }
    }
    
    return localCart;
  } catch (error) {
    console.error('Error syncing cart with backend:', error);
    // Return local cart as fallback
    return localCart;
  }
};