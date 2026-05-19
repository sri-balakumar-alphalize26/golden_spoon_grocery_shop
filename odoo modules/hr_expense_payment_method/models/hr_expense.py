from odoo import models, fields


class HrExpense(models.Model):
    _inherit = 'hr.expense'

    payment_method_id = fields.Many2one(
        'hr.expense.payment.method',
        string='Payment Method',
        required=True,
        domain="[('company_id', '=', company_id)]",
        default=lambda self: self.env['hr.expense.payment.method'].get_default_payment_method(),
    )
