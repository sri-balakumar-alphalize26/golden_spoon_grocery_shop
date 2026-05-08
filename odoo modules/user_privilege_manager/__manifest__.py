{
    'name': 'User Privilege Manager',
    'version': '19.0.4.1.0',
    'category': 'Administration',
    'summary': 'Granular user-level CRUD + Hide Menu + Hide Module + Group-based privileges + User Management',
    'description': """
        User Privilege Manager
        ======================
        This module provides a centralized interface to manage granular
        user-level access privileges on any Odoo model, menu, and module.

        Features:
        ---------
        * Per-user, per-model privilege assignment (Create, Read, Edit, Cancel, Delete)
        * Hide Menu Button: hide specific top-level or sub-menus per user or group
        * Hide Module Button: hide entire installed modules (app icons) per user or group
        * Group-based menu & module visibility (assign groups to users)
        * User Management: create and manage users directly from the module
        * Connected with Odoo's native user/group settings
        * Backend enforcement (blocks operations with clear error messages)
        * Frontend enforcement (hides buttons dynamically)
        * Admin dashboard to manage all privileges
        * Bulk privilege assignment
        * Default: if no privilege record exists, standard Odoo access applies
        * Precedence: User-level > Group-level > Default (visible)
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': ['base', 'web'],
    'data': [
        'security/security_groups.xml',
        'security/ir.model.access.csv',
        'wizard/role_add_models_wizard_views.xml',
        'wizard/privilege_bulk_wizard_views.xml',
        'views/user_privilege_views.xml',
        'views/privilege_role_views.xml',
        'views/module_privilege_views.xml',
        'views/module_visibility_views.xml',
        'views/menu_privilege_views.xml',
        'views/dashboard_action.xml',
        'views/res_users_views.xml',
        'views/menu.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'user_privilege_manager/static/src/css/privilege_dashboard.css',
            'user_privilege_manager/static/src/js/privilege_controller.js',
            'user_privilege_manager/static/src/js/privilege_dashboard.js',
            'user_privilege_manager/static/src/js/navbar_patch.js',
            'user_privilege_manager/static/src/xml/privilege_templates.xml',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'installable': True,
    'application': True,
    'auto_install': False,
}
