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
    # user_privilege_manager_apps provides the app.feature.app catalog the
    # data/easy_purchase_app_features.xml below registers into. Without
    # this dep the data file would fail to load.
    'depends': ['purchase', 'stock', 'account', 'user_privilege_manager_apps'],
    'data': [
        'security/security_groups.xml',
        'security/ir.model.access.csv',
        'security/easy_purchase_security.xml',
        'report/barcode_report.xml',
        'views/easy_purchase_payment_method_views.xml',
        'views/easy_purchase_views.xml',
        'views/easy_purchase_menus.xml',
        'data/easy_purchase_app_features.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
