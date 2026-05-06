import random
import logging
from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class EasyPurchase(models.Model):
    _name = 'easy.purchase'
    _description = 'Easy Purchase Entry'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'date desc, id desc'

    name = fields.Char(string='Reference', required=True, copy=False, readonly=True, default=lambda self: _('New'))
    date = fields.Date(string='Date', required=True, default=fields.Date.context_today, tracking=True)
    partner_id = fields.Many2one('res.partner', string='Vendor', required=True, tracking=True)
    company_id = fields.Many2one('res.company', string='Company', required=True, default=lambda self: self.env.company)
    currency_id = fields.Many2one('res.currency', string='Currency', required=True, default=lambda self: self.env.company.currency_id)
    discount_type = fields.Selection([('percentage', 'Percentage'), ('amount', 'Amount')], string='Discount Type', default='percentage', required=True)
    line_ids = fields.One2many('easy.purchase.line', 'purchase_id', string='Purchase Lines', copy=True)
    state = fields.Selection([('draft', 'Draft'), ('done', 'Done'), ('cancelled', 'Cancelled')], string='Status', default='draft', tracking=True)

    amount_untaxed = fields.Monetary(string='Untaxed Amount', compute='_compute_amounts', store=True, currency_field='currency_id')
    amount_tax = fields.Monetary(string='Taxes', compute='_compute_amounts', store=True, currency_field='currency_id')
    amount_total = fields.Monetary(string='Total', compute='_compute_amounts', store=True, currency_field='currency_id')

    purchase_order_id = fields.Many2one('purchase.order', string='Purchase Order', readonly=True, copy=False)
    picking_id = fields.Many2one('stock.picking', string='Receipt', readonly=True, copy=False)
    invoice_id = fields.Many2one('account.move', string='Vendor Bill', readonly=True, copy=False)
    payment_ids = fields.Many2many(
        'account.payment',
        'easy_purchase_payment_rel',
        'easy_purchase_id',
        'payment_id',
        string='Registered Payments',
        readonly=True,
        copy=False
    )

    reference = fields.Char(string='Vendor Reference')
    notes = fields.Text(string='Notes')

    auto_validate_bill = fields.Boolean(string='Auto-Post Bill', default=True)
    auto_register_payment = fields.Boolean(string='Auto-Register Payment', default=True)
    warehouse_id = fields.Many2one('stock.warehouse', string='Warehouse', required=True,
        default=lambda self: self.env['stock.warehouse'].search([('company_id', '=', self.env.company.id)], limit=1))

    payment_method_id = fields.Many2one(
        'easy.purchase.payment.method',
        string='Payment Method',
        required=True,
        domain="[('company_id', '=', company_id)]",
        default=lambda self: self.env['easy.purchase.payment.method'].get_default_payment_method(),
    )
    payment_term_id = fields.Many2one(
        'account.payment.term',
        string='Payment Terms',
        readonly=False,
        help='Payment terms for credit purchases. Only applicable when payment method is Vendor Credit.',
    )
    is_credit_purchase = fields.Boolean(
        compute='_compute_is_credit_purchase',
        store=False,
    )

    payment_state = fields.Selection([
        ('not_paid', 'Not Paid'),
        ('paid', 'Paid'),
        ('invoiced', 'Fully Invoiced'),
    ], string='Payment Status', compute='_compute_payment_state', store=True)

    @api.depends('payment_method_id')
    def _compute_is_credit_purchase(self):
        for record in self:
            record.is_credit_purchase = (
                record.payment_method_id
                and record.payment_method_id.is_vendor_account
            )

    @api.depends('invoice_id.payment_state', 'payment_ids', 'payment_method_id', 'state')
    def _compute_payment_state(self):
        for record in self:
            is_credit_purchase = record.payment_method_id and record.payment_method_id.is_vendor_account

            if is_credit_purchase:
                record.payment_state = 'invoiced'
            elif record.invoice_id and record.invoice_id.payment_state == 'paid':
                record.payment_state = 'paid'
            elif record.payment_ids:
                record.payment_state = 'paid'
            else:
                record.payment_state = 'not_paid'

    @api.depends('line_ids.subtotal', 'line_ids.tax_amount')
    def _compute_amounts(self):
        for record in self:
            record.amount_untaxed = sum(record.line_ids.mapped('subtotal'))
            record.amount_tax = sum(record.line_ids.mapped('tax_amount'))
            record.amount_total = record.amount_untaxed + record.amount_tax

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', _('New')) == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('easy.purchase') or _('New')
        return super().create(vals_list)

    def action_confirm(self):
        for record in self:
            if not record.line_ids.filtered(lambda l: not l.display_type):
                raise UserError(_('Please add at least one product line.'))

            if not record.partner_id:
                raise UserError(_('Please select a Vendor.'))

            if not record.payment_method_id:
                raise UserError(_('Please select a Payment Method.'))

            # Use company context for all operations
            record_company = record.with_company(record.company_id)

            # 1. Create and confirm Purchase Order
            po = record_company._create_purchase_order()
            record.purchase_order_id = po.id
            po.button_confirm()

            # 2. Validate receipt (goods incoming)
            picking = po.picking_ids.filtered(lambda p: p.state not in ('done', 'cancel'))
            if picking:
                picking = picking[0]
                record.picking_id = picking.id
                record_company._validate_picking(picking)

            # 3. Create and post vendor bill
            bill = record_company._create_vendor_bill(po)
            if bill:
                record.invoice_id = bill.id

                if record.auto_validate_bill:
                    bill.action_post()

                    # 4. Register payment (skip for vendor credit)
                    if record.auto_register_payment and record.payment_method_id:
                        if not record.payment_method_id.is_vendor_account:
                            record_company._register_payment(bill)

            record.state = 'done'
        return True

    def _create_purchase_order(self):
        self.ensure_one()
        po_lines = []
        for line in self.line_ids:
            if line.display_type:
                continue
            po_lines.append((0, 0, {
                'product_id': line.product_id.id,
                'name': line.description or line.product_id.display_name,
                'product_qty': line.quantity,
                'product_uom_id': line.uom_id.id,
                'price_unit': line.price_unit,
                'discount': (line.discount / line.price_unit * 100.0) if self.discount_type == 'amount' and line.price_unit else line.discount,
                'tax_ids': [(6, 0, line.tax_ids.ids)] if line.tax_ids else False,
                'date_planned': self.date,
            }))

        po_vals = {
            'partner_id': self.partner_id.id,
            'date_order': self.date,
            'date_planned': self.date,
            'company_id': self.company_id.id,
            'currency_id': self.currency_id.id,
            'partner_ref': self.reference,
            'picking_type_id': self.warehouse_id.in_type_id.id,
            'order_line': po_lines,
            'origin': self.name,
        }

        # Pass payment terms for credit purchases
        if self.payment_term_id:
            po_vals['payment_term_id'] = self.payment_term_id.id

        po = self.env['purchase.order'].with_company(self.company_id).create(po_vals)

        if self.notes:
            po.message_post(body=self.notes, message_type='comment')
        return po

    def _validate_picking(self, picking):
        """Validate receipt in the correct company context.
        This ensures stock moves reflect in inventory reports.
        """
        self.ensure_one()
        picking = picking.with_company(self.company_id)
        for move in picking.move_ids:
            move.quantity = move.product_uom_qty

        picking = picking.with_context(
            skip_backorder=True,
            skip_immediate=True,
            skip_sms=True,
            cancel_backorder=True,
        )
        result = picking.button_validate()

        if isinstance(result, dict) and result.get('res_model'):
            wizard_model = result.get('res_model')
            wizard_context = result.get('context', {})
            try:
                wizard = self.env[wizard_model].with_context(**wizard_context).create({
                    'pick_ids': [(4, picking.id)],
                })
                wizard.process()
            except Exception:
                pass

    def _create_vendor_bill(self, po):
        """Create vendor bill from purchase order in the correct company context."""
        self.ensure_one()
        action = po.with_company(self.company_id).action_create_invoice()

        bill = False
        if action.get('res_id'):
            bill = self.env['account.move'].browse(action['res_id'])
        elif action.get('domain'):
            bill = self.env['account.move'].search(action['domain'], limit=1)
        else:
            bill = self.env['account.move'].search([
                ('move_type', '=', 'in_invoice'),
                ('partner_id', '=', self.partner_id.id),
                ('invoice_origin', '=', po.name),
            ], limit=1)

        if bill:
            bill.write({'invoice_date': self.date, 'ref': self.reference or self.name})
        return bill

    def _register_payment(self, bill):
        """Register payment on the vendor bill using the payment register wizard.

        Uses the same mechanism as clicking "Register Payment" on a bill.
        Temporarily swaps outstanding account to journal default so payment
        posts directly to "Paid" (no bank reconciliation needed).
        """
        self.ensure_one()
        if not self.payment_method_id:
            return False

        journal = self.payment_method_id.journal_id

        # Get outbound payment method line (for vendor/supplier payments)
        payment_method_line = journal.outbound_payment_method_line_ids[:1]
        if not payment_method_line:
            raise UserError(
                _('Journal "%s" has no outbound payment methods configured.\n'
                  'Go to Accounting → Configuration → Journals → %s → '
                  'Outgoing Payments tab and add a payment method.',
                  journal.name, journal.name)
            )

        # Force direct payment: set outstanding = default account
        original_outstanding_account = payment_method_line.payment_account_id
        journal_default_account = journal.default_account_id
        need_restore = False

        if journal_default_account and original_outstanding_account != journal_default_account:
            payment_method_line.sudo().write({
                'payment_account_id': journal_default_account.id,
            })
            need_restore = True

        try:
            PaymentRegister = self.env['account.payment.register'].with_company(
                self.company_id
            ).with_context(
                active_model='account.move',
                active_ids=bill.ids,
            )

            wizard = PaymentRegister.create({
                'journal_id': journal.id,
                'payment_method_line_id': payment_method_line.id,
                'amount': bill.amount_total,
                'payment_date': self.date,
            })

            result = wizard.action_create_payments()

            payment = False
            if isinstance(result, dict):
                if result.get('res_id'):
                    payment = self.env['account.payment'].browse(result['res_id'])
                elif result.get('domain'):
                    payment = self.env['account.payment'].search(
                        result['domain'], limit=1, order='id desc'
                    )
                elif result.get('res_model') == 'account.payment':
                    payment = self.env['account.payment'].search([
                        ('partner_id', '=', self.partner_id.id),
                        ('journal_id', '=', journal.id),
                        ('amount', '=', bill.amount_total),
                    ], limit=1, order='id desc')

            if payment:
                self.payment_ids = [(6, 0, payment.ids)]

        except Exception as e:
            raise UserError(
                _('Error registering payment: %(error)s\n\n'
                  'Please check:\n'
                  '• Payment Journal "%(journal)s" is correctly configured\n'
                  '• The journal has outbound payment methods\n'
                  '• The vendor has a payable account set',
                  error=str(e),
                  journal=journal.name)
            )
        finally:
            if need_restore:
                payment_method_line.sudo().write({
                    'payment_account_id': original_outstanding_account.id if original_outstanding_account else False,
                })

        return payment

    def action_cancel(self):
        for record in self:
            if record.state == 'done':
                raise UserError(_('Cannot cancel a completed purchase. Please reverse the related documents.'))
            record.state = 'cancelled'
        return True

    def action_draft(self):
        for record in self:
            if record.state == 'cancelled':
                record.state = 'draft'
        return True

    def action_view_purchase_order(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': _('Purchase Order'), 'res_model': 'purchase.order',
                'res_id': self.purchase_order_id.id, 'view_mode': 'form', 'target': 'current'}

    def action_view_receipt(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': _('Receipt'), 'res_model': 'stock.picking',
                'res_id': self.picking_id.id, 'view_mode': 'form', 'target': 'current'}

    def action_view_bill(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': _('Vendor Bill'), 'res_model': 'account.move',
                'res_id': self.invoice_id.id, 'view_mode': 'form', 'target': 'current'}

    def action_view_payments(self):
        self.ensure_one()
        if len(self.payment_ids) == 1:
            return {'type': 'ir.actions.act_window', 'name': _('Payment'), 'res_model': 'account.payment',
                    'res_id': self.payment_ids[0].id, 'view_mode': 'form', 'target': 'current'}
        return {
            'type': 'ir.actions.act_window',
            'name': _('Payments'),
            'res_model': 'account.payment',
            'view_mode': 'list,form',
            'domain': [('id', 'in', self.payment_ids.ids)],
            'target': 'current',
        }


class EasyPurchaseLine(models.Model):
    _name = 'easy.purchase.line'
    _description = 'Easy Purchase Line'
    _order = 'sequence, id'

    sequence = fields.Integer(default=10)
    display_type = fields.Selection(
        selection=[
            ('line_section', 'Section'),
            ('line_note', 'Note'),
        ],
        default=False,
    )
    name = fields.Text(string='Description')
    purchase_id = fields.Many2one('easy.purchase', string='Purchase', required=True, ondelete='cascade')
    product_id = fields.Many2one('product.product', string='Product', domain=[('purchase_ok', '=', True)])
    description = fields.Char(string='Description')
    quantity = fields.Float(string='Quantity', required=True, default=1.0)
    uom_id = fields.Many2one('uom.uom', string='Unit', required=True, compute='_compute_uom_id', store=True, readonly=False, precompute=True)
    price_unit = fields.Float(string='Unit Price', required=True, digits='Product Price')
    discount = fields.Float(string='Discount', digits='Discount', default=0.0)
    discount_type = fields.Selection(related='purchase_id.discount_type', string='Discount Type')
    tax_ids = fields.Many2many('account.tax', string='Taxes', domain=[('type_tax_use', '=', 'purchase')])
    currency_id = fields.Many2one(related='purchase_id.currency_id', string='Currency')
    subtotal = fields.Monetary(string='Subtotal', compute='_compute_amounts', store=True, currency_field='currency_id')
    tax_amount = fields.Monetary(string='Tax Amount', compute='_compute_amounts', store=True, currency_field='currency_id')
    total = fields.Monetary(string='Total', compute='_compute_amounts', store=True, currency_field='currency_id')

    @api.depends('product_id')
    def _compute_uom_id(self):
        for line in self:
            if line.product_id and not line.uom_id:
                line.uom_id = line.product_id.uom_id
            elif not line.product_id:
                line.uom_id = False

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('product_id') and not vals.get('uom_id'):
                product = self.env['product.product'].browse(vals['product_id'])
                vals['uom_id'] = product.uom_id.id
        return super().create(vals_list)

    @api.depends('quantity', 'price_unit', 'discount', 'discount_type', 'tax_ids')
    def _compute_amounts(self):
        for line in self:
            if line.discount_type == 'amount':
                price = line.price_unit - (line.discount or 0.0)
            else:
                price = line.price_unit * (1 - (line.discount or 0.0) / 100.0)
            price = max(price, 0.0)
            line.subtotal = line.quantity * price
            if line.tax_ids:
                taxes = line.tax_ids.compute_all(price, line.currency_id, line.quantity,
                    product=line.product_id, partner=line.purchase_id.partner_id)
                line.tax_amount = taxes['total_included'] - taxes['total_excluded']
                line.total = taxes['total_included']
            else:
                line.tax_amount = 0.0
                line.total = line.subtotal

    @api.onchange('product_id')
    def _onchange_product_id(self):
        if self.product_id:
            self.description = self.product_id.display_name
            self.uom_id = self.product_id.uom_id
            self.price_unit = self.product_id.standard_price
            if self.product_id.supplier_taxes_id:
                self.tax_ids = self.product_id.supplier_taxes_id
            else:
                self.tax_ids = self.env.company.account_purchase_tax_id

    @api.onchange('uom_id')
    def _onchange_uom_id(self):
        if self.product_id and self.uom_id:
            if self.product_id.uom_id != self.uom_id:
                self.price_unit = self.product_id.uom_id._compute_price(self.product_id.standard_price, self.uom_id)

    def action_print_barcode(self):
        self.ensure_one()
        wizard = self.env['easy.purchase.barcode.wizard'].create({
            'line_id': self.id,
            'product_id': self.product_id.id,
            'quantity': int(self.quantity) or 1,
            'retail_price': self.product_id.lst_price,
            'wholesale_price': self.product_id.standard_price,
        })
        return {
            'name': 'Print Barcode Labels',
            'type': 'ir.actions.act_window',
            'res_model': 'easy.purchase.barcode.wizard',
            'res_id': wizard.id,
            'view_mode': 'form',
            'target': 'new',
        }
