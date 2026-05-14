{
    'name': 'Device Login Configuration',
    'version': '19.0.3.0.0',
    'category': 'Technical/Authentication',
    'summary': 'Pre-register devices by MAC address; only approved devices can configure the app',
    'description': """
        Device Login Configuration
        ==========================
        Enforces MAC-address-based device approval for the Tool Management mobile app.

        Admin Workflow:
          1. Go to Device Registry → Devices → New
          2. Enter the device's MAC Address and a Device Name
          3. Save — status is automatically set to Pre-Registered

        App Workflow:
          1. Open the app → Device Setup screen
          2. Enter Server URL, select Database, enter MAC Address
          3. App calls POST /device/lookup → if MAC is pre-registered, proceed
          4. App calls POST /device/activate → links its UUID to the MAC record
          5. Status changes to Active; user proceeds to the login screen

        Access is blocked when:
          - The MAC address is not in the pre-registered list
          - The device status is set to Blocked by an administrator
          - A different app installation (different UUID) tries to claim an already-active MAC

        API Endpoints:
          POST /device/lookup   – check if MAC is pre-registered
          POST /device/activate – link app UUID to a pre-registered MAC record
    """,
    'author': 'Custom',
    'depends': ['web', 'base'],
    'data': [
        'security/device_security.xml',
        'security/ir.model.access.csv',
        'views/device_registry_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'device_login_config/static/src/css/device_qr_scanner.css',
            'device_login_config/static/src/js/device_qr_scanner.js',
            'device_login_config/static/src/js/device_autosave.js',
        ],
    },
    'images': ['static/description/icon.png'],
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
