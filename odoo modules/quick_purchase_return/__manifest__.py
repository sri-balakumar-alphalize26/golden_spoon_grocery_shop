{
    'name': 'Quick Purchase Return',
    'version': '19.0.1.5.0',
    'category': 'Inventory/Purchase',
    'summary': 'POS-style purchase return for small businesses',
    'description': """
Quick Purchase Return Module
============================

A simple, single-screen purchase return interface designed for small businesses.

Features:
---------
* Select any posted Vendor Bill
* Automatically loads all product lines
* Enter partial or full return quantities
* Prevents over-returning (validates against already returned quantities)
* One-click creation of:
    - Vendor Credit Note (properly linked to original bill)
    - Purchase Return Stock Picking (from original receipts)
* Full accounting and inventory integrity
* Lot/Serial number support for tracked products
* No modification of core Odoo logic

Workflow:
---------
1. Open Purchase Return → Select Invoice → Enter Return Qty → Confirm → Done

The module creates proper accounting entries and stock movements while 
maintaining full traceability and audit compliance.
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': [
        'purchase',
        'stock',
        'account',
        'purchase_stock',
    ],
    'data': [
        'data/currency_data.xml',
        'security/ir.model.access.csv',
        'security/quick_purchase_return_security.xml',
        'views/quick_purchase_return_views.xml',
        'views/quick_purchase_return_menus.xml',
    ],
    'assets': {},
    'installable': True,
    'application': True,
    'auto_install': False,
    'post_init_hook': 'set_currency_3_decimals',
}
