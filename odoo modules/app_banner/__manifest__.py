{
    'name': 'App Banner',
    'version': '19.0.1.0.0',
    'category': 'Tools',
    'summary': 'Manage home screen banner images for the mobile app',
    'depends': ['base'],
    'data': [
        'security/ir.model.access.csv',
        'views/app_banner_views.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
