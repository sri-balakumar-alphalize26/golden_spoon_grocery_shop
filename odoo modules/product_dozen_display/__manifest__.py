{
    'name': 'Product Dozen Display',
    'version': '19.0.1.0.0',
    'category': 'Inventory',
    'summary': 'Show on-hand stock as "X Dozen Y Pcs" and auto-create the Dozens unit',
    'description': """
Product Dozen Display
=====================
Adds a read-only "On Hand (Dozen + Pcs)" field on the product form and the
products list that breaks the on-hand quantity into full dozens plus the loose
remainder (e.g. 115 on hand -> "9 Dozen 7 Pcs"). Pack size is 12.

On install it also:
  * auto-ensures the "Dozens" unit (1 Dozen = 12) exists under
    Inventory -> Configuration -> Units of Measure, and
  * enables the "Units of Measure" feature so that menu is visible.
    """,
    'author': 'Alphalize Technologies',
    'website': 'https://www.alphalize.com',
    'depends': ['product', 'stock', 'uom'],
    'data': [
        'data/uom_data.xml',
        'views/product_views.xml',
        'views/stock_quant_views.xml',
    ],
    'post_init_hook': 'post_init_hook',
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
