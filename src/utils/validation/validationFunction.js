// utils/validationFunctions.js

export const validateRequired = value => !!value;
export const validateEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const validatePhoneNumber = number => /^[0-9]{10}$/.test(number);
