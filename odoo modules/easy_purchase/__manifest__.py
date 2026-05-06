{
    'name': 'Easy Purchase',
    'version': '19.0.4.0.0',
    'category': 'Inventory/Purchase',
    'summary': 'One-click purchase entry with auto payment and barcode printing',
    'description': """
Easy Purchase Module
====================
- Single form for purchase entry
- Auto-creates purchase order
- Auto-receives inventory
- Auto-creates vendor bill
- Auto-registers payment
- Barcode label printing
- Payment method configuration
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': ['purchase', 'stock', 'account'],
    'data': [
        'security/ir.model.access.csv',
        'security/easy_purchase_security.xml',
        'report/barcode_report.xml',
        'views/easy_purchase_payment_method_views.xml',
        'views/easy_purchase_views.xml',
        'views/easy_purchase_menus.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
