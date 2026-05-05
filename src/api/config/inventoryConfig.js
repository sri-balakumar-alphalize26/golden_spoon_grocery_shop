// src/api/config/inventoryConfig.js
// Central config for inventory-related API base URL.
// Use EXPO_PUBLIC_INVENTORY_API to override in different environments (recommended).
const INVENTORY_API_BASE = process.env.EXPO_PUBLIC_INVENTORY_API || 'https://ecc8cccc612a35b.ngrok-free.app';

export default INVENTORY_API_BASE;
