def migrate(cr, version):
    # Force common currencies to 3 decimal places. Direct SQL bypasses
    # ir.model.data noupdate protection on base currency records.
    # rounding must match decimal_places, otherwise computed totals
    # (amount_untaxed/amount_tax/amount_total) get clipped to 2 decimals
    # by currency.round() before display.
    cr.execute("""
        UPDATE res_currency
           SET decimal_places = 3,
               rounding = 0.001
         WHERE name IN ('USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'OMR')
    """)
    # Standard Odoo's purchase.order.line / sale.order.line / account.move.line
    # use decimal.precision 'Product Price' (price_unit) and 'Account' (tax
    # computation). Default of 2 causes downstream PO/SO/Invoice totals to
    # drift from our custom modules' totals. Force 3 to keep them in sync.
    cr.execute("""
        UPDATE decimal_precision
           SET digits = 3
         WHERE name IN ('Product Price', 'Account', 'Discount')
    """)
