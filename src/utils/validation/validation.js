import { allValidationRules } from './validationRules';

export const validateFields = (formData, fieldsToValidate) => {
  const errors = {};
  let isValid = true;

  fieldsToValidate.forEach(field => {
    const rule = allValidationRules[field];
    if (rule && !rule.validate(formData[field])) {
      errors[field] = rule.message;
      isValid = false;
    }
  });

  return { isValid, errors };
};