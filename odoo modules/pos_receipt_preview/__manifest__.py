{
    'name': 'POS Receipt Preview',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Preview a POS order receipt in the backend at a chosen paper '
               'size, mirroring the React Native app receipt (signatures included).',
    'description': """
        POS Receipt Preview
        ===================
        Adds a "Preview Receipt" button on the pos.order backend form
        (Point of Sale > Orders > Orders > open an order). Tapping it opens a
        small popup to choose the receipt paper size — the same six options the
        React Native app offers (2"/3"/3.5"/4"/A5/A4) — and renders the receipt
        view-only at that width.

        The rendered receipt reproduces the app's receipt template
        (src/utils/invoiceHtml.js): bilingual letterhead, RTL items table,
        totals, payment details and the customer/cashier signatures (read from
        the same ir.attachment records the app writes). No new stored fields are
        added; the module only reads existing pos.order / pos.payment data.
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': ['base', 'point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
        'report/pos_receipt_report.xml',
        'wizard/pos_receipt_preview_wizard_views.xml',
        'views/pos_order_views.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
