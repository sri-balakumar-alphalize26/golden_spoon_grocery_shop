{
    'name': 'POS Total Discount Button',
    'version': '19.0.1.1.0',
    'category': 'Point of Sale',
    'summary': 'Apply discount on total order amount from POS navbar',
    'description': """
        Adds a Discount button to the POS top navigation bar
        that applies a percentage discount on the total order amount.
        - Preset discount percentages (10%, 20%, 30%, 40%, 50%)
        - Discount shown as a separate negative line item
        - Tax-aware discount calculation
        - Manage discount variants (add/edit/delete)
    """,
    'author': 'Alphalize',
    'website': 'https://alphalize.com',
    'depends': ['pos_discount'],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_total_discount/static/src/app/navbar/total_discount_button.js',
            'pos_total_discount/static/src/app/navbar/total_discount_button.xml',
            'pos_total_discount/static/src/app/navbar/total_discount_button.scss',
            'pos_total_discount/static/src/app/orderline/orderline_patch.js',
            'pos_total_discount/static/src/app/orderline/orderline_patch.xml',
        ],
    },
    'post_init_hook': '_post_init_hook',
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
