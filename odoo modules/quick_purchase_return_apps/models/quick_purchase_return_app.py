from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
from datetime import date


class QuickPurchaseReturnApp(models.Model):
    """
    Quick Purchase Return App - POS-style interface for returning purchased goods.

    Standalone parallel build with .app-suffixed model names so it can coexist
    with the original quick.purchase.return module in the same database.
    """
    _name = 'quick.purchase.return.app'
    _description = 'Quick Purchase Return App'
    _order = 'date desc, id desc'

    name = fields.Char(
        string='Reference',
        required=True,
        copy=False,
        readonly=True,
        default=lambda self: _('New')
    )
    date = fields.Date(
        string='Return Date',
        required=True,
        default=fields.Date.context_today,
    )

    # Source document
    source_invoice_id = fields.Many2one(
        'account.move',
        string='Vendor Bill',
        required=True,
        domain=[
            ('move_type', '=', 'in_invoice'),
            ('state', '=', 'posted'),
            ('is_fully_returned_purchase_app', '=', False),
        ],
        help='Select the original Vendor Bill to return products from'
    )

    is_estimate = fields.Boolean(
        string='Is Estimate',
        compute='_compute_is_estimate',
        store=False,
    )

    # Side-effect compute: auto-repairs lines when the form opens on a draft
    # record (handles the onchange-persistence case where lines lose product data
    # after navigating away and back). Non-stored so it runs on every read.
    lines_autoloaded = fields.Boolean(
        compute='_compute_lines_autoloaded',
        store=False,
    )

    # Auto-filled from invoice
    partner_id = fields.Many2one(
        'res.partner',
        string='Vendor',
        compute='_compute_from_invoice',
        store=True,
        readonly=True,
    )
    invoice_date = fields.Date(
        string='Invoice Date',
        compute='_compute_from_invoice',
        store=True,
        readonly=True,
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        required=True,
        default=lambda self: self.env.company
    )
    currency_id = fields.Many2one(
        'res.currency',
        string='Currency',
        compute='_compute_from_invoice',
        store=True,
        readonly=True,
    )

    # Return lines
    line_ids = fields.One2many(
        'quick.purchase.return.line.app',
        'return_id',
        string='Return Lines',
        copy=True
    )

    state = fields.Selection([
        ('draft', 'Draft'),
        ('done', 'Done'),
        ('cancelled', 'Cancelled')
    ], string='Status', default='draft')

    # Computed totals
    amount_untaxed = fields.Monetary(
        string='Untaxed Amount',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )
    amount_tax = fields.Monetary(
        string='Taxes',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )
    amount_total = fields.Monetary(
        string='Total',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )

    # Created documents
    credit_note_id = fields.Many2one(
        'account.move',
        string='Credit Note',
        readonly=True,
        copy=False
    )
    return_picking_id = fields.Many2one(
        'stock.picking',
        string='Return Picking',
        readonly=True,
        copy=False
    )

    # Settings
    auto_post_credit_note = fields.Boolean(
        string='Auto-Post Credit Note',
        default=True,
        help='Automatically post the vendor credit note upon confirmation'
    )
    auto_validate_picking = fields.Boolean(
        string='Auto-Validate Return',
        default=True,
        help='Automatically validate the return stock picking'
    )
    warehouse_id = fields.Many2one(
        'stock.warehouse',
        string='Warehouse',
        required=True,
        default=lambda self: self.env['stock.warehouse'].search(
            [('company_id', '=', self.env.company.id)], limit=1
        )
    )

    notes = fields.Text(string='Notes')

    @api.depends('source_invoice_id')
    def _compute_is_estimate(self):
        for record in self:
            record.is_estimate = (
                record.source_invoice_id
                and record.source_invoice_id.source_module_app == 'estimate_purchase'
            )

    @api.depends('source_invoice_id', 'state', 'line_ids', 'line_ids.product_id')
    def _compute_lines_autoloaded(self):
        """
        Auto-reload lines from the source vendor bill whenever the form is read
        on a draft record where lines are missing or have lost their product data.
        Preserves any return_qty values the user has already entered.
        """
        for record in self:
            record.lines_autoloaded = False
            if record.state != 'draft' or not record.source_invoice_id:
                continue
            if not isinstance(record.id, int):
                continue

            bad_lines = record.line_ids.filtered(lambda l: not l.product_id)
            needs_initial_load = not record.line_ids and record.source_invoice_id

            if not bad_lines and not needs_initial_load:
                continue

            qtys_by_index = [l.return_qty for l in record.line_ids.sorted('sequence')]
            record._load_invoice_lines()
            reloaded = record.line_ids.sorted('sequence')
            for idx, line in enumerate(reloaded):
                if idx < len(qtys_by_index) and qtys_by_index[idx] > 0:
                    line.return_qty = min(qtys_by_index[idx], line.returnable_qty)
            record.lines_autoloaded = True

    @api.depends('source_invoice_id')
    def _compute_from_invoice(self):
        """Compute fields from the selected vendor bill"""
        for record in self:
            if record.source_invoice_id:
                record.partner_id = record.source_invoice_id.partner_id
                record.invoice_date = record.source_invoice_id.invoice_date
                record.currency_id = record.source_invoice_id.currency_id
            else:
                record.partner_id = False
                record.invoice_date = False
                record.currency_id = self.env.company.currency_id

    @api.depends('line_ids.subtotal', 'line_ids.tax_amount')
    def _compute_amounts(self):
        """Compute total amounts from return lines"""
        for record in self:
            record.amount_untaxed = sum(record.line_ids.mapped('subtotal'))
            record.amount_tax = sum(record.line_ids.mapped('tax_amount'))
            record.amount_total = record.amount_untaxed + record.amount_tax

    @api.model_create_multi
    def create(self, vals_list):
        """Override create to generate sequence"""
        for vals in vals_list:
            if vals.get('name', _('New')) == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('quick.purchase.return.app') or _('New')
        return super().create(vals_list)

    @api.onchange('source_invoice_id')
    def _onchange_source_invoice_id(self):
        """Load invoice lines when vendor bill is selected"""
        if self.source_invoice_id:
            # Clear existing lines first
            self.line_ids = [(5, 0, 0)]

            lines_to_create = []
            for inv_line in self.source_invoice_id.invoice_line_ids:
                # Skip non-product lines (sections, notes, etc.)
                if inv_line.display_type in ('line_section', 'line_note'):
                    continue

                # Skip lines without products
                if not inv_line.product_id:
                    continue

                # Calculate already returned quantity for this product
                already_returned = self._get_already_returned_qty_onchange(inv_line)
                returnable_qty = inv_line.quantity - already_returned

                if returnable_qty <= 0:
                    continue  # Skip fully returned products

                # Get UoM - handle both possible field names
                uom_id = False
                if hasattr(inv_line, 'product_uom_id') and inv_line.product_uom_id:
                    uom_id = inv_line.product_uom_id.id
                elif hasattr(inv_line, 'uom_id') and inv_line.uom_id:
                    uom_id = inv_line.uom_id.id
                elif inv_line.product_id:
                    uom_id = inv_line.product_id.uom_id.id

                lines_to_create.append((0, 0, {
                    'source_invoice_line_id': inv_line.id,
                    'product_id': inv_line.product_id.id,
                    'description': inv_line.name or inv_line.product_id.display_name,
                    'purchased_qty': inv_line.quantity,
                    'already_returned_qty': already_returned,
                    'returnable_qty': returnable_qty,
                    'return_qty': 0.0,
                    'uom_id': uom_id,
                    'price_unit': inv_line.price_unit,
                    'tax_ids': [(6, 0, inv_line.tax_ids.ids)] if inv_line.tax_ids else [],
                    'discount': inv_line.discount if hasattr(inv_line, 'discount') else 0.0,
                }))

            self.line_ids = lines_to_create

            # Safety: if the selected vendor bill has nothing left to return
            # (all products already fully returned), clear the selection and
            # warn the user instead of leaving an empty draft behind.
            if not lines_to_create:
                bill_name = self.source_invoice_id.name or ''
                self.source_invoice_id = False
                return {
                    'warning': {
                        'title': _('Nothing to Return'),
                        'message': _(
                            'Vendor Bill "%s" has all its products already fully '
                            'returned. Please select a different bill.'
                        ) % bill_name,
                    }
                }
        else:
            self.line_ids = [(5, 0, 0)]

    def _get_already_returned_qty_onchange(self, invoice_line):
        """
        Calculate already returned quantity for an invoice line (onchange version).
        """
        already_returned = 0.0

        # Find all credit notes linked to this invoice
        credit_notes = self.env['account.move'].search([
            ('move_type', '=', 'in_refund'),
            ('state', '=', 'posted'),
            ('reversed_entry_id', '=', invoice_line.move_id.id),
        ])

        for cn in credit_notes:
            for cn_line in cn.invoice_line_ids:
                if (cn_line.product_id == invoice_line.product_id and
                    cn_line.price_unit == invoice_line.price_unit):
                    already_returned += cn_line.quantity

        return already_returned

    def _load_invoice_lines(self):
        """Load all product lines from the source invoice"""
        self.ensure_one()
        self.line_ids = [(5, 0, 0)]  # Clear existing lines

        lines_to_create = []
        for inv_line in self.source_invoice_id.invoice_line_ids:
            # Skip non-product lines (sections, notes, etc.)
            # In Odoo 19, check display_type for section/note lines
            if inv_line.display_type in ('line_section', 'line_note'):
                continue

            # Skip lines without products
            if not inv_line.product_id:
                continue

            # Calculate already returned quantity for this product
            already_returned = self._get_already_returned_qty(inv_line)
            returnable_qty = inv_line.quantity - already_returned

            if returnable_qty <= 0:
                continue  # Skip fully returned products

            # Get UoM - handle both possible field names
            uom_id = False
            if hasattr(inv_line, 'product_uom_id') and inv_line.product_uom_id:
                uom_id = inv_line.product_uom_id.id
            elif hasattr(inv_line, 'uom_id') and inv_line.uom_id:
                uom_id = inv_line.uom_id.id
            elif inv_line.product_id:
                uom_id = inv_line.product_id.uom_id.id

            lines_to_create.append((0, 0, {
                'source_invoice_line_id': inv_line.id,
                'product_id': inv_line.product_id.id,
                'description': inv_line.name or inv_line.product_id.display_name,
                'purchased_qty': inv_line.quantity,
                'already_returned_qty': already_returned,
                'returnable_qty': returnable_qty,
                'return_qty': 0.0,  # User will enter this
                'uom_id': uom_id,
                'price_unit': inv_line.price_unit,
                'tax_ids': [(6, 0, inv_line.tax_ids.ids)] if inv_line.tax_ids else [],
                'discount': inv_line.discount if hasattr(inv_line, 'discount') else 0.0,
            }))

        self.line_ids = lines_to_create

    def _get_already_returned_qty(self, invoice_line):
        """
        Calculate already returned quantity for an invoice line.
        Looks at all posted credit notes linked to the original invoice.
        """
        already_returned = 0.0

        # Find all credit notes linked to this invoice
        credit_notes = self.env['account.move'].search([
            ('move_type', '=', 'in_refund'),
            ('state', '=', 'posted'),
            ('reversed_entry_id', '=', invoice_line.move_id.id),
        ])

        for cn in credit_notes:
            for cn_line in cn.invoice_line_ids:
                # Match by product and price (could be multiple lines with same product)
                if (cn_line.product_id == invoice_line.product_id and
                    cn_line.price_unit == invoice_line.price_unit):
                    already_returned += cn_line.quantity

        return already_returned

    def action_load_lines(self):
        """Button action to reload lines from invoice"""
        self.ensure_one()
        if not self.source_invoice_id:
            raise UserError(_('Please select a Vendor Bill first.'))
        self._load_invoice_lines()
        return True

    def action_return_full(self):
        """Set all lines to return full returnable quantity. Self-heals by
        reloading lines from the vendor bill if they're missing or corrupted."""
        self.ensure_one()
        if not self.source_invoice_id:
            raise UserError(_('Please select a Vendor Bill first.'))

        bad_lines = self.line_ids.filtered(lambda l: not l.product_id)
        if bad_lines or not self.line_ids:
            self._load_invoice_lines()

        for line in self.line_ids:
            line.return_qty = line.returnable_qty
        return True

    def action_confirm(self):
        """
        Main confirmation action - creates Credit Note and Return Picking atomically.
        """
        for record in self:
            # Safety check: if lines have no product data (onchange persistence issue),
            # auto-reload them from the invoice before proceeding
            if record.source_invoice_id and record.line_ids:
                bad_lines = record.line_ids.filtered(lambda l: not l.product_id)
                if bad_lines:
                    # Capture return quantities by position index (order preserved)
                    return_qtys_by_index = []
                    for line in record.line_ids:
                        return_qtys_by_index.append(line.return_qty)

                    # Reload lines from invoice (server-side, creates real DB records)
                    record._load_invoice_lines()

                    # Restore return quantities by position
                    reloaded_lines = record.line_ids.sorted('sequence')
                    for idx, line in enumerate(reloaded_lines):
                        if idx < len(return_qtys_by_index) and return_qtys_by_index[idx] > 0:
                            line.return_qty = min(return_qtys_by_index[idx], line.returnable_qty)

            record._validate_return()
            record_company = record.with_company(record.company_id)

            # Create Credit Note
            credit_note = record_company._create_credit_note()
            record.credit_note_id = credit_note.id

            # Create Return Picking
            return_picking = record_company._create_return_picking()
            record.return_picking_id = return_picking.id

            # Auto-post credit note if configured
            if record.auto_post_credit_note:
                credit_note.action_post()

                # Auto-reconcile credit note with original bill
                try:
                    payable_lines = (credit_note + record.source_invoice_id).line_ids.filtered(
                        lambda l: l.account_id.account_type == 'liability_payable'
                        and not l.reconciled
                    )
                    if payable_lines:
                        payable_lines.reconcile()
                except Exception:
                    pass  # Don't block if reconciliation fails

            # Auto-validate picking if configured
            if record.auto_validate_picking and return_picking:
                record._validate_return_picking(return_picking)

            record.state = 'done'

        return True

    def _validate_return(self):
        """Validate the return before processing"""
        self.ensure_one()

        # Check if there are any lines to return (with product and positive qty)
        lines_to_return = self.line_ids.filtered(lambda l: l.product_id and l.return_qty > 0)
        if not lines_to_return:
            raise UserError(_('Please enter at least one return quantity.'))

        # Validate each line
        for line in lines_to_return:
            if line.return_qty > line.returnable_qty:
                raise ValidationError(_(
                    'Return quantity for "%s" (%.2f) exceeds returnable quantity (%.2f).\n'
                    'Purchased: %.2f, Already Returned: %.2f'
                ) % (
                    line.product_id.display_name,
                    line.return_qty,
                    line.returnable_qty,
                    line.purchased_qty,
                    line.already_returned_qty
                ))
            if line.return_qty < 0:
                raise ValidationError(_(
                    'Return quantity for "%s" cannot be negative.'
                ) % line.product_id.display_name)

    def _create_credit_note(self):
        """
        Create a Vendor Credit Note linked to the original invoice.
        Uses standard Odoo account.move with move_type='in_refund'
        """
        self.ensure_one()

        # Prepare invoice lines - only lines with product and positive return qty
        invoice_lines = []
        for line in self.line_ids.filtered(lambda l: l.product_id and l.return_qty > 0):
            invoice_lines.append((0, 0, {
                'product_id': line.product_id.id,
                'name': line.description or line.product_id.display_name,
                'quantity': line.return_qty,
                'product_uom_id': line.uom_id.id if line.uom_id else line.product_id.uom_id.id,
                'price_unit': line.price_unit,
                'tax_ids': [(6, 0, line.tax_ids.ids)] if line.tax_ids else [],
                'discount': line.discount or 0.0,
            }))

        # Create the credit note
        credit_note_vals = {
            'move_type': 'in_refund',
            'partner_id': self.partner_id.id,
            'invoice_date': self.date,
            'date': self.date,
            'currency_id': self.currency_id.id,
            'company_id': self.company_id.id,
            'reversed_entry_id': self.source_invoice_id.id,
            'ref': _('Return: %s - %s') % (self.source_invoice_id.name or '', self.name),
            'invoice_origin': self.source_invoice_id.name,
            'invoice_line_ids': invoice_lines,
            'narration': self.notes,
        }

        credit_note = self.env['account.move'].with_company(self.company_id).create(credit_note_vals)

        # Post message on original invoice
        self.source_invoice_id.message_post(
            body=_('Purchase Return "%s" created Credit Note: <a href="#">%s</a>') % (
                self.name, credit_note.name or 'Draft'
            )
        )

        return credit_note

    def _create_return_picking(self):
        """
        Create a return stock picking from the original receipt(s).
        This ensures proper traceability and stock valuation.
        """
        self.ensure_one()

        # Get the original receipt(s) related to the invoice
        # Usually through purchase order
        original_pickings = self._get_original_pickings()

        if not original_pickings:
            # Create a direct return picking without linking to original
            return self._create_direct_return_picking()

        # Create return picking from the original receipt
        return self._create_return_from_picking(original_pickings[0])

    def _get_original_pickings(self):
        """
        Find the original incoming stock picking(s) related to the invoice.
        """
        self.ensure_one()

        pickings = self.env['stock.picking']

        # Method 1: Through purchase order link
        if self.source_invoice_id.invoice_origin:
            purchase_orders = self.env['purchase.order'].search([
                ('name', 'in', self.source_invoice_id.invoice_origin.split(', ')),
                ('company_id', '=', self.company_id.id),
            ])
            if purchase_orders:
                pickings = purchase_orders.mapped('picking_ids').filtered(
                    lambda p: p.state == 'done' and p.picking_type_id.code == 'incoming'
                )

        # Method 2: Through purchase.bill.union if available
        if not pickings and hasattr(self.source_invoice_id, 'purchase_order_ids'):
            purchase_orders = self.source_invoice_id.purchase_order_ids
            if purchase_orders:
                pickings = purchase_orders.mapped('picking_ids').filtered(
                    lambda p: p.state == 'done' and p.picking_type_id.code == 'incoming'
                )

        return pickings

    def _create_return_from_picking(self, original_picking):
        """
        Create a return picking based on the original receipt.
        This uses the standard return mechanism for proper traceability.
        """
        self.ensure_one()

        # Get the return picking type
        return_picking_type = original_picking.picking_type_id.return_picking_type_id
        if not return_picking_type:
            # Fallback to outgoing type
            return_picking_type = self.warehouse_id.out_type_id

        # Create the return picking
        return_picking_vals = {
            'picking_type_id': return_picking_type.id,
            'partner_id': self.partner_id.id,
            'location_id': original_picking.location_dest_id.id,  # Where goods are now
            'location_dest_id': original_picking.location_id.id,  # Back to vendor
            'origin': _('%s (Return from %s)') % (self.name, original_picking.name),
            'company_id': self.company_id.id,
            'move_ids': [],
        }

        # Prepare stock moves - only lines with product and positive return qty
        move_vals = []
        for line in self.line_ids.filtered(lambda l: l.product_id and l.return_qty > 0):
            # Find the original move for this product
            original_move = original_picking.move_ids.filtered(
                lambda m: m.product_id == line.product_id and m.state == 'done'
            )

            uom_id = line.uom_id.id if line.uom_id else line.product_id.uom_id.id

            if original_move:
                original_move = original_move[0]
                move_vals.append((0, 0, {
                    'product_id': line.product_id.id,
                    'description_picking': line.product_id.display_name,
                    'product_uom_qty': line.return_qty,
                    'product_uom': uom_id,
                    'location_id': original_picking.location_dest_id.id,
                    'location_dest_id': original_picking.location_id.id,
                    'origin_returned_move_id': original_move.id,
                    'procure_method': 'make_to_stock',
                }))
            else:
                # Product wasn't in original picking, create new move
                move_vals.append((0, 0, {
                    'product_id': line.product_id.id,
                    'description_picking': line.product_id.display_name,
                    'product_uom_qty': line.return_qty,
                    'product_uom': uom_id,
                    'location_id': original_picking.location_dest_id.id,
                    'location_dest_id': original_picking.location_id.id,
                    'procure_method': 'make_to_stock',
                }))

        return_picking_vals['move_ids'] = move_vals

        return_picking = self.env['stock.picking'].with_company(self.company_id).create(return_picking_vals)
        return_picking.action_confirm()

        return return_picking

    def _create_direct_return_picking(self):
        """
        Create a return picking directly without linking to original receipt.
        Used when original receipt cannot be found.
        """
        self.ensure_one()

        # Use the warehouse's return type or outgoing type
        picking_type = self.warehouse_id.out_type_id

        # Get supplier location
        supplier_location = self.env.ref('stock.stock_location_suppliers')

        # Get stock location
        stock_location = self.warehouse_id.lot_stock_id

        return_picking_vals = {
            'picking_type_id': picking_type.id,
            'partner_id': self.partner_id.id,
            'location_id': stock_location.id,
            'location_dest_id': supplier_location.id,
            'origin': _('%s (Return from %s)') % (self.name, self.source_invoice_id.name),
            'company_id': self.company_id.id,
            'move_ids': [],
        }

        move_vals = []
        for line in self.line_ids.filtered(lambda l: l.product_id and l.return_qty > 0):
            uom_id = line.uom_id.id if line.uom_id else line.product_id.uom_id.id
            move_vals.append((0, 0, {
                'product_id': line.product_id.id,
                'description_picking': line.product_id.display_name,
                'product_uom_qty': line.return_qty,
                'product_uom': uom_id,
                'location_id': stock_location.id,
                'location_dest_id': supplier_location.id,
                'procure_method': 'make_to_stock',
            }))

        return_picking_vals['move_ids'] = move_vals

        return_picking = self.env['stock.picking'].with_company(self.company_id).create(return_picking_vals)
        return_picking.action_confirm()

        return return_picking

    def _validate_return_picking(self, picking):
        """Auto-validate the return stock picking"""
        self.ensure_one()
        picking = picking.with_company(self.company_id)

        # Set quantities done
        for move in picking.move_ids:
            move.quantity = move.product_uom_qty

        # Validate with skip_backorder context
        picking = picking.with_context(
            skip_backorder=True,
            skip_immediate=True,
            skip_sms=True,
            cancel_backorder=True,
        )
        result = picking.button_validate()

        # Handle wizard if returned
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

    def action_cancel(self):
        """Cancel the return"""
        for record in self:
            if record.state == 'done':
                raise UserError(_(
                    'Cannot cancel a completed return. '
                    'Please reverse the Credit Note and Return Picking manually.'
                ))
            record.state = 'cancelled'
        return True

    def action_draft(self):
        """Reset to draft"""
        for record in self:
            if record.state == 'cancelled':
                record.state = 'draft'
        return True

    def action_view_credit_note(self):
        """View the created credit note"""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Vendor Credit Note'),
            'res_model': 'account.move',
            'res_id': self.credit_note_id.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def action_view_return_picking(self):
        """View the return stock picking"""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Return Picking'),
            'res_model': 'stock.picking',
            'res_id': self.return_picking_id.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def action_view_source_invoice(self):
        """View the source vendor bill"""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Vendor Bill'),
            'res_model': 'account.move',
            'res_id': self.source_invoice_id.id,
            'view_mode': 'form',
            'target': 'current',
        }


class QuickPurchaseReturnLineApp(models.Model):
    """
    Quick Purchase Return Line App - Individual product line in a return.
    """
    _name = 'quick.purchase.return.line.app'
    _description = 'Quick Purchase Return Line App'
    _order = 'sequence, id'

    sequence = fields.Integer(default=10)
    return_id = fields.Many2one(
        'quick.purchase.return.app',
        string='Return',
        required=True,
        ondelete='cascade'
    )
    source_invoice_line_id = fields.Many2one(
        'account.move.line',
        string='Source Invoice Line',
        readonly=True,
        help='The original invoice line this return relates to'
    )

    # Product info
    product_id = fields.Many2one(
        'product.product',
        string='Product',
        readonly=True,
    )
    description = fields.Char(string='Description', readonly=True)

    # Quantities - all readonly except return_qty
    purchased_qty = fields.Float(
        string='Purchased Qty',
        readonly=True,
        digits='Product Unit of Measure',
        help='Original quantity purchased'
    )
    already_returned_qty = fields.Float(
        string='Already Returned',
        readonly=True,
        digits='Product Unit of Measure',
        help='Quantity already returned in previous returns'
    )
    returnable_qty = fields.Float(
        string='Returnable Qty',
        readonly=True,
        digits='Product Unit of Measure',
        help='Maximum quantity that can be returned'
    )
    return_qty = fields.Float(
        string='Return Qty',
        required=True,
        default=0.0,
        digits='Product Unit of Measure',
        help='Quantity to return (enter the quantity you want to return)'
    )

    uom_id = fields.Many2one(
        'uom.uom',
        string='Unit',
        readonly=True,
    )

    # Pricing
    price_unit = fields.Float(
        string='Unit Price',
        readonly=True,
        digits='Product Price'
    )
    discount = fields.Float(
        string='Discount (%)',
        readonly=True,
        digits='Discount',
        default=0.0
    )
    tax_ids = fields.Many2many(
        'account.tax',
        'quick_purchase_return_line_app_tax_rel',
        'line_id',
        'tax_id',
        string='Taxes',
        readonly=True,
    )

    # Currency
    currency_id = fields.Many2one(
        related='return_id.currency_id',
        string='Currency'
    )

    # Computed amounts
    subtotal = fields.Monetary(
        string='Subtotal',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )
    tax_amount = fields.Monetary(
        string='Tax Amount',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )
    total = fields.Monetary(
        string='Total',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )

    # Lot/Serial tracking (optional)
    lot_id = fields.Many2one(
        'stock.lot',
        string='Lot/Serial',
        domain="[('product_id', '=', product_id)]",
        help='Select the lot/serial number to return (if tracked)'
    )
    tracking = fields.Selection(
        related='product_id.tracking',
        string='Tracking',
        readonly=True
    )

    @api.depends('return_qty', 'price_unit', 'discount', 'tax_ids')
    def _compute_amounts(self):
        """Compute line amounts based on return quantity"""
        for line in self:
            # Calculate price after discount
            price_after_discount = line.price_unit * (1 - (line.discount or 0.0) / 100.0)
            line.subtotal = line.return_qty * price_after_discount

            # Calculate tax
            if line.tax_ids and line.return_qty:
                taxes = line.tax_ids.compute_all(
                    price_after_discount,
                    line.currency_id,
                    line.return_qty,
                    product=line.product_id,
                    partner=line.return_id.partner_id
                )
                line.tax_amount = taxes['total_included'] - taxes['total_excluded']
                line.total = taxes['total_included']
            else:
                line.tax_amount = 0.0
                line.total = line.subtotal

    @api.constrains('return_qty', 'returnable_qty')
    def _check_return_qty(self):
        """Ensure return quantity doesn't exceed returnable quantity"""
        for line in self:
            if not line.product_id:
                continue
            if line.return_qty < 0:
                raise ValidationError(_(
                    'Return quantity for "%s" cannot be negative.'
                ) % line.product_id.display_name)
            if line.returnable_qty > 0 and line.return_qty > line.returnable_qty:
                raise ValidationError(_(
                    'Return quantity for "%s" (%.2f) exceeds returnable quantity (%.2f).'
                ) % (line.product_id.display_name, line.return_qty, line.returnable_qty))

    @api.onchange('return_qty')
    def _onchange_return_qty(self):
        """Validate return quantity on change"""
        if self.return_qty < 0:
            return {'warning': {
                'title': _('Invalid Quantity'),
                'message': _('Return quantity cannot be negative.')
            }}
        if self.return_qty > self.returnable_qty:
            self.return_qty = self.returnable_qty
            return {'warning': {
                'title': _('Quantity Adjusted'),
                'message': _('Return quantity has been set to maximum returnable quantity (%.2f).') % self.returnable_qty
            }}
