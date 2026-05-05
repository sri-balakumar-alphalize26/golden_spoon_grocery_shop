import { DROP_DOWN_API_ENDPOINTS } from "@api/endpoints";
import { get } from "@api/services/utils";
import handleApiError from "@api/utils/handleApiError";
import { fetchProductsOdoo } from "@api/services/generalApi";

const fetchData = async (endpoint) => {
  try {
    const response = await get(endpoint);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

const fetchDataUsingWarehouse = async (endpoint, id) => {
  try {
    const response = await get(`${endpoint}?warehouse_id=${id}`);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchInvoiceDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.INVOICE);
};

export const fetchSalesReturnDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.SALES_RETURN);
};

export const fetchPurchaseReturnDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.PURCHASE_RETURN);
};

export const fetchServiceReturnDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.SERVICE_RETURN);
};

export const fetchStockTransferDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.STOCK_TRANSFER);
};

export const fetchServiceDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.SERVICE);
};

export const fetchVendorBillDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.VENDOR_BILL);
};

export const fetchEmployeesDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.EMPLOYEE_DROPDOWN);
};

export const fetchCustomersDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.CUSTOMER_DROPDOWN);
};

export const fetchDepartmentsDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.DEPARTMENT_DROPDOWN);
};

export const fetchBrandsDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.BRAND_DROPDOWN);
};

export const fetchPurposeofVisitDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.PURPOSE_OF_VISIT_DROPDOWN);
}

export const fetchSiteLocationDropdown = async (customerId) => {
  return fetchData(`${DROP_DOWN_API_ENDPOINTS.SITE_LOCATION_DROPDOWN}?customer_id=${customerId}`);
}

export const fetchCountryDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.COUNTRY);
}

export const fetchStateDropdown = async (countryId) => {
  return fetchData(`${DROP_DOWN_API_ENDPOINTS.STATE}?country_id=${countryId}`);
}

export const fetchAreaDropdown = async (stateId) => {
  return fetchData(`${DROP_DOWN_API_ENDPOINTS.AREA}?state_id=${stateId}`);
};

export const fetchSalesPersonDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.SALESPERSON);
}

export const fetchCollectionAgentDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.COLLECTIONAGENT);
}

export const fetchCustomerBehaviourDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.VIEW_CUSTOMERBEHAVIOUR);
}

export const fetchLanguageDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.LANGUAGE);
}

export const fetchCurrencyDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.CURRENCY);
}

export const fetchSourceDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.SOURCE);
}

export const fetchOpportunityDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.OPPORTUNITY);
}

export const fetchEnquiryTypeDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.ENQUIRY_TYPE);
}

export const fetchNonInspectedBoxDropdown = async (id) => {
  return fetchDataUsingWarehouse(DROP_DOWN_API_ENDPOINTS.NON_INSPECTED, id);
}

export const fetchProductsDropdown = async (searchText = '') => {
  // Query Odoo for products and normalize to dropdown shape used by the app
  try {
    const products = await fetchProductsOdoo({ offset: 0, limit: 50, searchText });
    // normalize: backend dropdowns expect items with _id and product_name
    return products.map(p => ({
      _id: p.id,
      product_name: p.product_name || p.name || '',
      product_description: p.product_description || '',
      cost: p.price || 0,
      image_url: p.image_url || null,
      categ_id: p.categ_id || null,
    }));
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

export const fetchUomDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.UOM);
}

export const fetchCustomerNameDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.CUSTOMER_NAME);
}

export const fetchWarehouseDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.WAREHOUSE);
}

export const fetchDeviceDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.DEVICE);
}

export const fetchBrandDropdown = async (deviceId) => {
  return fetchData(`${DROP_DOWN_API_ENDPOINTS.BRAND}?job_device_id=${deviceId}`);
}

export const fetchConsumerModelDropdown = async (deviceId, brandId) => {
  return fetchData(`${DROP_DOWN_API_ENDPOINTS.CONSUMER_MODEL}?job_device_id=${deviceId}&job_brand_id=${brandId}`);
}

export const fetchAssigneeDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.ASSIGNED_TO);
}

export const fetchAccessoriesDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.ACCESSORIES);
}

export const fetchComplaintsDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.COMPLAINTS);
}

export const fetchSubComplaintsDropdown = async (complaintsId) => {
  return fetchData(`${DROP_DOWN_API_ENDPOINTS.SUB_COMPLAINTS}?master_problem_id=${complaintsId}`);
}

export const fetchUnitOfMeasureDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.UNIT_OF_MEASURE);
}

export const fetchTaxDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.TAXES);
}

export const fetchPaymentModeDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.PAYMENT_MODE);
}

export const fetchBankChequeDropdown = async () => {
  return fetchData(DROP_DOWN_API_ENDPOINTS.BANK_CHEQUE);
}

export const fetchSupplierDropdown = async (searchText = '') => {
  return fetchData(`${DROP_DOWN_API_ENDPOINTS.SUPPLIERS}?name=${searchText}`);
}