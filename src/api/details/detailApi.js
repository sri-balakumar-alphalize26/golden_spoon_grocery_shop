import { get } from "../services/utils";
import handleApiError from "@api/utils/handleApiError";
import { API_ENDPOINTS, DETAIL_API_ENDPOINTS } from "@api/endpoints";

const {
  GET_INVOICE_DETAILS,
  GET_VENDOR_DETAILS,
  GET_SALES_RETURN_DETAILS,
  GET_PURCHASE_RETURN_DETAILS,
  GET_CAPITAL_PAYMENT_DETAILS,
  GET_JOB_INVOICE_DETAILS,
  GET_SPARE_PARTS_ISSUE_DETAILS,
  GET_SPARE_PARTS_ISSUE_AUDIT_DETAILS,
  GET_PETTY_CASH_ALLOTMENT_DETAILS,
  GET_PETTY_CASH_EXPENSE_DETAILS,
  GET_PETTY_CASH_TRANSFER_DETAILS,
  GET_PETTY_CASH_RETURN_DETAILS,
  GET_CAPITAL_RECEIPTS_DETAILS,
  GET_CUSTOMER_RECEIPTS_DETAILS,
  GET_CUSTOMER_PAYMENT_DETAILS,
  GET_CASH_RECEIPTS_DETAILS,
  GET_CASH_PAYMENTS_DETAILS,
  GET_EXPENSE_DETAILS,
  GET_SUPPLIER_RECEIPTS_DETAILS,
  GET_SUPPLIER_PAYMENTS_DETAILS,
  GET_LEDGER_TYPE_DETAILS,
  GET_SALARY_PAYMENT_DETAILS,
  GET_SALARY_ADVANCE_PAYMENT_DETAILS,
  GET_COLLECTION_TYPE_DETAILS,
  GET_CHEQUE_LEDGER,
  GET_INVENTORY_DETAILS,
  GET_PRODUCT_DETAILS,
  GET_STOCK_TRANSFER_DETAILS,
  GET_FUND_TRANSFER_DETAILS,
  GET_JOB_REGISTER_PAYMENT_DETAILS,
  GET_SERVICE_RETURN_DETAILS,
  GET_PAYMENT_RECEIPT_DETAILS
} = DETAIL_API_ENDPOINTS;

// fetch stock transfer details
const fetchAuditDetail = async (endpoint, sequenceNo) => {
  try {
    const response = await get(`${endpoint}?qr_sequence_no=${sequenceNo}`);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

// Fetches details for a given endpoint and sequence number.
const fetchAuditDetails = async (endpoint, sequenceNo) => {
  try {
    const response = await get(`${endpoint}?sequence_no=${sequenceNo}`);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

// Fetches details for a given endpoint and detail ID.
const fetchDetails = async (endpoint, detailId) => {
  try {
    const response = await get(`${endpoint}/${detailId}`)
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

// Fetches details for a given endpoint and detail ID.
const fetchBarcodeDetails = async (endpoint, code) => {
  try {
    const response = await get(`${endpoint}?barcode=${code}`)
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

// Fetches details for a given endpoint and search.
const fetchDetailBySearch = async (endpoint, search, warehouseId) => {
  try {
    const response = await get(`${endpoint}?name=${search}&warehouse_id=${warehouseId}`);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

const fetchKPIDetail = async (endpoint, detailId, loginEmployeeId) => {
  try {
    const response = await get(`${endpoint}/${detailId}?login_employee_id=${loginEmployeeId}`);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

// Function to fetch collection type details
const fetchCollectionType = async (businessTypeId, paymentMethodId) => {
  try {
    const response = await get(`${GET_COLLECTION_TYPE_DETAILS}?bussiness_type_id=${businessTypeId}&payment_method_id=${paymentMethodId}`);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

// Function to fetch collection type details
const fetchLedgerDetail = async (ledgerId) => {
  try {
    const response = await get(`${GET_LEDGER_TYPE_DETAILS}?ledger_id=${ledgerId}`);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

export const fetchVehicles = async () => {
  try {
    const response = await get(GET_VEHICLES_DETAILS);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchVehicleDetails = async (vehicleId) => {
  return fetchDetails(GET_VEHICLES_DETAILS, vehicleId);
};

export const fetchDrivers = async () => {
  try {
    const response = await get(GET_DRIVERS_DETAILS);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchLocations = async () => {
  try {
    const response = await get(GET_LOCATIONS_DETAILS);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};



// Fetch list of vehicle tracking records
export const fetchVehicleTrackingList = async () => {
  try {
    const response = await get(SUBMIT_VEHICLE_TRACKING); // Same endpoint for GET
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

// Fetch specific vehicle tracking record by ID
export const fetchVehicleTrackingDetails = async (trackingId) => {
  try {
    const response = await get(`${SUBMIT_VEHICLE_TRACKING}/${trackingId}`);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};






// Object containing functions to fetch transaction auditing details
export const fetchBills = {
  invoiceDetails: async (sequenceNo) => fetchAuditDetail(GET_INVOICE_DETAILS, sequenceNo),
  vendorDetails: async (sequenceNo) => fetchAuditDetail(GET_VENDOR_DETAILS, sequenceNo),
  salesReturnDetails: async (sequenceNo) => fetchAuditDetails(GET_SALES_RETURN_DETAILS, sequenceNo),
  purchaseReturnDetails: async (sequenceNo) => fetchAuditDetails(GET_PURCHASE_RETURN_DETAILS, sequenceNo),
  capitalPaymentDetails: async (sequenceNo) => fetchAuditDetails(GET_CAPITAL_PAYMENT_DETAILS, sequenceNo),
  jobInvoiceDetails: async (sequenceNo) => fetchAuditDetail(GET_JOB_INVOICE_DETAILS, sequenceNo),
  stockTransferDetails: async (sequenceNo) => fetchAuditDetail(GET_STOCK_TRANSFER_DETAILS, sequenceNo),
  fundTransferDetails: async (sequenceNo) => fetchAuditDetails(GET_FUND_TRANSFER_DETAILS, sequenceNo),
  sparePartsIssueDetails: async (sequenceNo) => fetchAuditDetail(GET_SPARE_PARTS_ISSUE_DETAILS, sequenceNo),
  sparePartsIssueAuditDetails: async (issueId) => fetchDetails(GET_SPARE_PARTS_ISSUE_AUDIT_DETAILS, issueId),
  pettyCashAllotmentDetails: async (sequenceNo) => fetchAuditDetails(GET_PETTY_CASH_ALLOTMENT_DETAILS, sequenceNo),
  pettyCashExpenseDetails: async (sequenceNo) => fetchAuditDetails(GET_PETTY_CASH_EXPENSE_DETAILS, sequenceNo),
  salaryPaymentDetails: async (sequenceNo) => fetchAuditDetails(GET_SALARY_PAYMENT_DETAILS, sequenceNo),
  salaryAdvancePaymentDetails: async (sequenceNo) => fetchAuditDetails(GET_SALARY_ADVANCE_PAYMENT_DETAILS, sequenceNo),
  pettyCashTransferDetails: async (sequenceNo) => fetchAuditDetails(GET_PETTY_CASH_TRANSFER_DETAILS, sequenceNo),
  pettyCashReturnDetails: async (sequenceNo) => fetchAuditDetails(GET_PETTY_CASH_RETURN_DETAILS, sequenceNo),
  capitalRecieptsDetails: async (sequenceNo) => fetchAuditDetails(GET_CAPITAL_RECEIPTS_DETAILS, sequenceNo),
  customerReceiptsDetails: async (sequenceNo) => fetchAuditDetail(GET_CUSTOMER_RECEIPTS_DETAILS, sequenceNo),
  customerPaymentDetails: async (sequenceNo) => fetchAuditDetail(GET_CUSTOMER_PAYMENT_DETAILS, sequenceNo),
  cashReceiptsDetails: async (sequenceNo) => fetchAuditDetails(GET_CASH_RECEIPTS_DETAILS, sequenceNo),
  cashPaymentsDetails: async (sequenceNo) => fetchAuditDetails(GET_CASH_PAYMENTS_DETAILS, sequenceNo),
  expenseDetails: async (sequenceNo) => fetchAuditDetails(GET_EXPENSE_DETAILS, sequenceNo),
  supplierReceiptsDetails: async (sequenceNo) => fetchAuditDetail(GET_SUPPLIER_RECEIPTS_DETAILS, sequenceNo),
  supplierPaymentsDetails: async (sequenceNo) => fetchAuditDetail(GET_SUPPLIER_PAYMENTS_DETAILS, sequenceNo),
  ledgerTypeDetails: async (sequenceNo) => fetchAuditDetails(GET_LEDGER_TYPE_DETAILS, sequenceNo),
  chequeLedgerDetails: async (sequenceNo) => fetchAuditDetails(GET_CHEQUE_LEDGER, sequenceNo),
  jobRegisterPaymentDetails: async (sequenceNo) => fetchAuditDetails(GET_JOB_REGISTER_PAYMENT_DETAILS, sequenceNo),
  serviceReturnDetails: async (sequenceNo) => fetchAuditDetail(GET_SERVICE_RETURN_DETAILS, sequenceNo),
  paymentReceiptDetails: async (sequenceNo) => fetchAuditDetails(GET_PAYMENT_RECEIPT_DETAILS, sequenceNo),
  collectionTypeDetails: async (businessTypeId, paymentMethodId) => fetchCollectionType(businessTypeId, paymentMethodId),
  ledgerTypeDetails: async (ledgerId) => fetchLedgerDetail(ledgerId),
};

export const fetchInventoryDetails = async (detailId) => {
  return fetchDetails(GET_INVENTORY_DETAILS, detailId);
};

export const fetchProductDetails = async (detailId) => {
  return fetchDetails(GET_PRODUCT_DETAILS, detailId);
};

export const fetchProductDetailsByBarcode = async (code) => {
  return fetchBarcodeDetails(GET_PRODUCT_DETAILS, code);
};

export const fetchInventoryDetailsByName = async (name, warehouseId) => {
  return fetchDetailBySearch(GET_INVENTORY_DETAILS, name, warehouseId);
};

export const fetchCustomerDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_CUSTOMERS, detailId);
};

export const fetchCustomerVisitDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_CUSTOMER_VISIT_LIST, detailId);
};

export const fetchEnquiryRegisterDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_ENQUIRY_REGISTER, detailId);
};

export const fetchServiceDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_SERVICE, detailId);
};

export const fetchSparePartsDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_SPARE_PARTS, detailId);
};

export const fetchPickupDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_PICKUP, detailId);
};

export const fetchLeadDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_LEAD, detailId);
};

export const fetchPipelineDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_PIPELINE, detailId);
};

export const fetchMeetingsDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_MEETINGS, detailId);
};

export const fetchAuditingDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_AUDITING, detailId);
};

export const fetchVisitPlanDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_VISIT_PLAN, detailId);
};

export const fetchKPIDashboardDetails = async (detailId, loginEmployeeId) => {
  // console.log("detailId : ", detailId);
  // console.log("loginEmployeeId : ", loginEmployeeId);
  return fetchKPIDetail(API_ENDPOINTS.VIEW_KPI, detailId, loginEmployeeId);
};

export const fetchPurchaseRequisitionDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_PURCHASE_REQUISITION, detailId);
};

export const fetchPriceEnquiryDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_PRICE, detailId);
};

export const fetchPurchaseOrderDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_PURCHASE_ORDER, detailId);
};

export const fetchDeliveryNoteDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_DELIVERY_NOTE, detailId);
};

export const fetchVendorBillDetails = async (detailId) => {
  return fetchDetails(API_ENDPOINTS.VIEW_VENDOR_BILL, detailId);
};