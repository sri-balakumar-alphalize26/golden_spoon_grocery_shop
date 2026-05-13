{
    'name': 'POS Order Location',
    'version': '19.0.1.0.1',
    'category': 'Point of Sale',
    'summary': 'Tag every POS order with the device GPS coordinates and place name captured at receipt time.',
    'description': """
        POS Order Location
        ==================
        Adds three fields to pos.order populated by the React Native app
        right after Validate Payment:
          * order_latitude  (Float)
          * order_longitude (Float)
          * order_location_name (Char) -- reverse-geocoded on the device
            via expo-location's reverseGeocodeAsync (free, on-device, no
            API key).
        The values are written via a plain ORM write from the app and
        rendered on the in-app receipt and on the order's backend form.
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'license': 'LGPL-3',
    'depends': ['base', 'point_of_sale'],
    'data': [
        'views/pos_order_views.xml',
        'views/menu.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
