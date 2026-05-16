{
    'name': 'Quick Purchase Return Apps',
    'version': '19.0.1.0.0',
    'category': 'Inventory/Purchase',
    'summary': 'POS-style purchase return for small businesses (standalone parallel build with .app-suffixed models)',
    'description': """
Quick Purchase Return Apps
==========================

Standalone parallel build of Quick Purchase Return with .app-suffixed models
and its own privilege/security groups. Can coexist with `quick_purchase_return`
in the same database without collision.

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
1. Open Quick Purchase Return Apps -> Select Invoice -> Enter Return Qty -> Confirm -> Done
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': [
        'purchase',
        'stock',
        'account',
        'purchase_stock',
        'user_privilege_manager_apps',
    ],
    'data': [
        'security/security_groups.xml',
        'security/ir.model.access.csv',
        'security/quick_purchase_return_apps_security.xml',
        'data/currency_data.xml',
        'data/quick_purchase_return_app_features.xml',
        'views/quick_purchase_return_apps_views.xml',
        'views/quick_purchase_return_apps_menus.xml',
    ],
    'assets': {},
    'installable': True,
    'application': True,
    'auto_install': False,
    'post_init_hook': 'set_currency_3_decimals',
}
