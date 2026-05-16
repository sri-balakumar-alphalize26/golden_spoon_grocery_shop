from . import models


def set_currency_3_decimals(env):
    # Bypasses ir.model.data noupdate protection on base.USD/EUR/... by
    # writing directly through the ORM. Runs on install and on every upgrade
    # via the matching post-migration script.
    # rounding must match decimal_places, otherwise totals get clipped to 2.
    env['res.currency'].sudo().with_context(active_test=False).search([
        ('name', 'in', ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'OMR']),
    ]).write({'decimal_places': 3, 'rounding': 0.001})
    # Standard Odoo's purchase.order.line / sale.order.line / account.move.line
    # use decimal.precision 'Product Price' for price_unit and 'Account' for
    # tax computation. They default to 2, which causes drift between our
    # custom modules' totals and the downstream PO/SO/Invoice totals. Force 3.
    env['decimal.precision'].sudo().search([
        ('name', 'in', ['Product Price', 'Account', 'Discount']),
    ]).write({'digits': 3})
