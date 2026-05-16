from odoo import models, fields, api


class AccountMoveSourceModuleApp(models.Model):
    _inherit = 'account.move'

    source_module_app = fields.Char(
        string='Source Module (App)',
        index=True,
        copy=False,
        help='Technical field to identify which app-suffixed module created this invoice/bill',
    )

    is_fully_returned_purchase_app = fields.Boolean(
        string='Fully Returned (Purchase App)',
        compute='_compute_is_fully_returned_purchase_app',
        store=True,
        index=True,
        help='True when every product line on this vendor bill has been '
             'completely returned via posted vendor refunds (in_refund).',
    )

    @api.depends(
        'invoice_line_ids',
        'invoice_line_ids.quantity',
        'invoice_line_ids.product_id',
        'invoice_line_ids.price_unit',
        'reversal_move_ids',
        'reversal_move_ids.state',
        'reversal_move_ids.invoice_line_ids',
        'reversal_move_ids.invoice_line_ids.quantity',
        'reversal_move_ids.invoice_line_ids.product_id',
        'reversal_move_ids.invoice_line_ids.price_unit',
        'state',
    )
    def _compute_is_fully_returned_purchase_app(self):
        """
        Mark a vendor bill as fully returned when every product line on it
        has been completely reversed by posted vendor refunds (in_refund)
        linked via reversed_entry_id.

        Only applicable to posted in_invoice records. For all other moves
        we keep the flag False so the field stays meaningful and cheap.
        """
        for move in self:
            # Only relevant for posted vendor bills that have product lines
            if move.move_type != 'in_invoice' or move.state != 'posted':
                move.is_fully_returned_purchase_app = False
                continue

            product_lines = move.invoice_line_ids.filtered(
                lambda l: l.product_id and l.display_type not in ('line_section', 'line_note')
            )
            if not product_lines:
                move.is_fully_returned_purchase_app = False
                continue

            # All posted vendor refunds reversing this bill
            vendor_refunds = self.env['account.move'].search([
                ('move_type', '=', 'in_refund'),
                ('state', '=', 'posted'),
                ('reversed_entry_id', '=', move.id),
            ])

            fully_returned = True
            for inv_line in product_lines:
                already_returned = 0.0
                for vr in vendor_refunds:
                    for vr_line in vr.invoice_line_ids:
                        if (vr_line.product_id == inv_line.product_id
                                and vr_line.price_unit == inv_line.price_unit):
                            already_returned += vr_line.quantity
                # If any line still has remaining returnable quantity, not fully returned
                if (inv_line.quantity - already_returned) > 0.0001:
                    fully_returned = False
                    break

            move.is_fully_returned_purchase_app = fully_returned
