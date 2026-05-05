// utils/validators/validationRules.js
import { validateEmail, validatePhoneNumber, validateRequired } from "./validationFunction";

export const allValidationRules = {
    name: {
        message: 'Please enter the Name',
        validate: validateRequired,
    },
    contactName: {
        message: 'Please enter the Contact Name',
        validate: validateRequired,
    },
    contactPerson: {
        message: 'Please enter select Contact Person',
        validate: validateRequired,
    },
    address: {
        message: 'Please enter the Address',
        validate: validateRequired,
    },
    phoneNumber: {
        message: 'Please enter a valid phone number',
        validate: value => validateRequired(value) && validatePhoneNumber(value),
    },
    emailAddress: {
        message: 'Please enter a valid email address',
        validate: value => validateRequired(value) && validateEmail(value),
    },
    source: {
        message: 'Please select the Source',
        validate: validateRequired,
    },
    salesPerson: {
        message: 'Please Select Sales Person',
        validate: validateRequired,
    },
    priority: {
        message: 'Please Select Priority',
        validate: validateRequired,
    },
    customerTypes: {
        message: 'Please select Customer Types',
        validate: validateRequired,
    },
    customerName: {
        message: 'Please select Customer Name',
        validate: validateRequired,
    },
    customerTitles: {
        message: 'Please select Customer Types',
        validate: validateRequired,
    },
    modeOfPayment: {
        message: 'Please select Mode Of Payment',
        validate: validateRequired,
    },
    customer: {
        message: 'Please select Customer ',
        validate: validateRequired,
    },
    employee: {
        message: 'Please select Employee ',
        validate: validateRequired,
    },
    opportunity: {
        message: 'Please select Opportunity',
        validate: validateRequired,
    },
    enquiryType: {
        message: 'Please select Enquiry Type',
        validate: validateRequired,
    },
    dateAndTime: {
        message: 'Please select Date and Time',
        validate: validateRequired,
    },
    siteLocation: {
        message: 'Please select Site Location',
        validate: validateRequired
    },
    visitPurpose: {
        message: 'Please select Purpose of Visit',
        validate: validateRequired
    },
    remarks: {
        message: 'Please enter remarks',
        validate: validateRequired,
    },
    box: {
        message: 'Please select box name',
        validate: validateRequired,
    },
    device: {
        message: 'Please Select Device Name',
        validate: validateRequired,
    },
    brand: {
        message: 'Please select Brand Name',
        validate: validateRequired,
    },
    consumerModel: {
        message: 'Please select Consumer Model',
        validate: validateRequired,
    },
    serialNumber: {
        message: 'Please select Serial Number',
        validate: validateRequired,
    },
    assignedTo: {
        message: 'Please select Assigned To',
        validate: validateRequired,
    },
    product: {
        message: 'Please select Spare Name',
        validate: validateRequired,
    },
    timeIn: {
        message: 'Please select Time In',
        validate: validateRequired,
    },
    timeOut: {
        message: 'Please select Time Out',
        validate: validateRequired,
    },
    requestedByName:{
        message: 'Please select Request By Name',
        validate: validateRequired,
    },
    warehouse: {
        message: 'Please select Warehouse',
        validate: validateRequired,
    },
    requireBy:{
        message: 'Please select Require By',
        validate: validateRequired,
    },
    productName: {
        message: 'Please select Product Name',
        validate: validateRequired,
    },
    quantity:{
        message: 'Please select Quantity',
        validate: validateRequired,
    },
    unitPrice:{
        message: 'Please select Unit Price',
        validate: validateRequired, 
    },
    supplier: {
        message: 'Please select Suppliers',
        validate: validateRequired,
    },
    vendorName: {
        message: 'Please select Vendor Name',
        validate: validateRequired,
    },
    paymentMode : {
        message: 'Please select Payment Mode',
        validate: validateRequired,
    },
    trnNumber: {
        message: 'Please select TRN Number',
        validate: validateRequired,
    },
    currency: {
        message: 'Please select Currency',
        validate: validateRequired,
    },
    purchaseType: {
        message: 'Please select Purchase Type',
        validate: validateRequired,
    },
    countryOfOrigin: {
        message: 'Please select Country Of Origin',
        validate: validateRequired,
    },
    billDate: {
        message: 'Please select Bill Date',
        validate: validateRequired,
    },
    reference: {
        message: 'Please select Reference',
        validate: validateRequired,
    },



    // Add other fields as needed
};
