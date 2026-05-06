from odoo import models, fields, api, _
from odoo.exceptions import ValidationError


class EasyPurchasePaymentMethod(models.Model):
    _name = 'easy.purchase.payment.method'
    _description = 'Easy Purchase Payment Method'
    _order = 'sequence, id'

    name = fields.Char(string='Payment Method', required=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one('res.company', string='Company', required=True, default=lambda self: self.env.company)
    journal_id = fields.Many2one(
        'account.journal',
        string='Journal',
        domain="[('type', 'in', ['cash', 'bank']), ('company_id', '=', company_id)]",
    )
    journal_type = fields.Selection(related='journal_id.type', string='Journal Type', readonly=True)
    is_default = fields.Boolean(string='Default Payment Method', default=False,
        help='If checked, this payment method will be selected by default on new Easy Purchase entries.')
    is_vendor_account = fields.Boolean(
        string='Vendor Account (Credit Purchase)',
        default=False,
        help='If checked, no payment is created. The bill stays unpaid and the amount '
             'remains in the vendor payable account (Partner Ledger). '
             'Use this for credit purchases where the vendor is paid later.'
    )
    notes = fields.Text(string='Notes')

    @api.onchange('is_vendor_account')
    def _onchange_is_vendor_account(self):
        """Clear journal when vendor account is selected and auto-fill name."""
        if self.is_vendor_account:
            self.journal_id = False
            if not self.name or self.name.strip().lower() in ('cash', 'bank transfer', 'bank', 'card', ''):
                self.name = 'Credit'
        else:
            if self.name and self.name.strip().lower() == 'credit':
                self.name = ''

    @api.constrains('name', 'company_id')
    def _check_unique_name(self):
        """Prevent duplicate payment method names (case-insensitive) per company."""
        for record in self:
            duplicate = self.search([
                ('company_id', '=', record.company_id.id),
                ('id', '!=', record.id),
                ('active', '=', True),
            ]).filtered(lambda r: r.name and record.name and r.name.strip().lower() == record.name.strip().lower())
            if duplicate:
                raise ValidationError(_(
                    'A payment method named "%s" already exists for this company.'
                ) % record.name)

    @api.constrains('is_vendor_account', 'company_id')
    def _check_unique_credit(self):
        """Prevent multiple credit (vendor account) payment methods per company."""
        for record in self:
            if record.is_vendor_account:
                duplicate = self.search([
                    ('company_id', '=', record.company_id.id),
                    ('is_vendor_account', '=', True),
                    ('id', '!=', record.id),
                    ('active', '=', True),
                ])
                if duplicate:
                    raise ValidationError(_(
                        'A credit payment method already exists for this company: "%s".\n'
                        'Only one credit (Vendor Account) payment method is allowed per company.'
                    ) % duplicate[0].name)

    @api.constrains('journal_id', 'company_id')
    def _check_unique_journal(self):
        """Prevent multiple payment methods using the same journal per company."""
        for record in self:
            if record.journal_id:
                duplicate = self.search([
                    ('company_id', '=', record.company_id.id),
                    ('journal_id', '=', record.journal_id.id),
                    ('id', '!=', record.id),
                    ('active', '=', True),
                ])
                if duplicate:
                    raise ValidationError(_(
                        'The journal "%s" is already used by payment method "%s".\n'
                        'Each payment method must use a different journal.'
                    ) % (record.journal_id.name, duplicate[0].name))

    @api.model
    def get_default_payment_method(self, company_id=None):
        company_id = company_id or self.env.company.id
        method = self.search([
            ('company_id', '=', company_id),
            ('is_default', '=', True),
            ('active', '=', True)
        ], limit=1)
        return method

    def write(self, vals):
        if vals.get('is_default'):
            for record in self:
                self.search([
                    ('company_id', '=', record.company_id.id),
                    ('is_default', '=', True),
                    ('id', 'not in', self.ids)
                ]).write({'is_default': False})
        return super().write(vals)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            # Auto-fill name for credit payment methods
            if vals.get('is_vendor_account') and not vals.get('name'):
                vals['name'] = 'Credit'
            if vals.get('is_default'):
                company_id = vals.get('company_id', self.env.company.id)
                self.search([
                    ('company_id', '=', company_id),
                    ('is_default', '=', True)
                ]).write({'is_default': False})
        return super().create(vals_list)
