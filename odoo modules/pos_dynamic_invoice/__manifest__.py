{
    'name': 'POS Dynamic Invoice',
    'version': '19.0.2.5.0',
    'category': 'Point of Sale',
    'summary': 'Editable, branded POS invoice (logo, company name, GST, footer, '
               'terms) rendered server-side at all 6 receipt sizes. When this '
               'module is installed the mobile app renders this dynamic invoice; '
               'otherwise it falls back to its built-in HTML/JS receipt.',
    'description': """
        POS Dynamic Invoice
        ===================
        Turns the POS receipt into an admin-editable, branded document without
        needing a new app release.

        A per-company settings record (Point of Sale > Configuration > Invoice
        Settings) lets the shop edit:
          * Brand name / address / phone / email (fallback to res.company)
          * VAT / GST number
          * Invoice logo (shown at the top of the receipt)
          * Header title and footer text
          * Show/hide the tax row
          * Bilingual Terms & Conditions (EN / AR)

        The receipt is rendered server-side as QWeb at the same six paper sizes
        the app offers (2"/3"/3.5"/4"/A5/A4) and is exposed to the React Native
        app via pos.order.get_dynamic_receipt_html(paper_size). The app probes
        for this module; when present it shows this dynamic invoice, otherwise it
        keeps using its own built-in receipt (src/utils/invoiceHtml.js).

        This module is standalone — it does NOT depend on pos_receipt_preview.
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': ['base', 'point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
        'report/pos_dynamic_invoice_report.xml',
        'wizard/pos_dynamic_invoice_wizard_views.xml',
        'views/pos_invoice_settings_views.xml',
        'views/pos_order_views.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
