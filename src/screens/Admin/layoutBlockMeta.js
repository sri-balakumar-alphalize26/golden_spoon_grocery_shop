// Shared block-type metadata for the native Invoice Layout editor — mirrors the
// module's BLOCK_TYPES catalog (models/pos_invoice_layout.py) and the editor's
// ADDABLE list (static/src/layout_editor/layout_editor.js).
export const BLOCK_TYPE_LABELS = {
  logo: 'Logo',
  company_name_en: 'Company Name (English)',
  company_name_ar: 'Company Name (Arabic)',
  header_info: 'Company Header',
  title: 'Title',
  meta_fields: 'Order Fields (No / Date / Customer)',
  items_table: 'Items Table',
  totals: 'Totals',
  payments: 'Payments',
  signatures: 'Signatures',
  footer: 'Footer',
  barcode: 'Barcode',
  qrcode: 'QR Code',
  custom_text: 'Custom Text',
};

// Order matches the editor's "Add section" dropdown.
export const ADDABLE_BLOCK_TYPES = [
  'custom_text', 'logo', 'company_name_en', 'company_name_ar', 'header_info', 'title',
  'meta_fields', 'items_table', 'totals', 'payments', 'signatures', 'footer', 'barcode', 'qrcode',
];

export const ALIGN_OPTIONS = ['auto', 'left', 'center', 'right'];
export const DIRECTION_OPTIONS = ['auto', 'ltr', 'rtl'];
export const BARCODE_FIELD_OPTIONS = [
  { value: 'name', label: 'Order Ref' },
  { value: 'id', label: 'Order ID' },
  { value: 'pos_reference', label: 'POS Reference' },
];
