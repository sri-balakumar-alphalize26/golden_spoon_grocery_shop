{
    'name': 'Easy Purchase Apps',
    'version': '19.0.4.0.0',
    'category': 'Inventory/Purchase',
    'summary': 'Easy Purchase (standalone parallel build with .app-suffixed models; installs alongside easy_purchase)',
    'description': """
Easy Purchase Apps
==================
Standalone parallel build of Easy Purchase. Provides the same functionality
(one-click purchase entry, auto payment, barcode printing, payment method
configuration) but with separately-named models (suffixed with ``.app``) and
its own dedicated security groups, so it can be installed alongside the
original ``easy_purchase`` module without any name or table collisions.
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': ['purchase', 'stock', 'account'],
    'data': [
        'security/security_groups.xml',
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
