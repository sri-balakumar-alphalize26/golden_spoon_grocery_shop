from odoo import api, fields, models

from .product import _root_uom, PIECES_PER_DOZEN


class StockQuant(models.Model):
    _inherit = 'stock.quant'

    dozen_inventory_quantity = fields.Float(
        string='Counted (Dozens)',
        compute='_compute_dozen_inventory_quantity',
        inverse='_set_dozen_inventory_quantity',
        help='Type the counted quantity in dozens; it fills the Counted '
             'Quantity in pieces (1 Dozen = 12).',
    )

    def _dozen_countable(self):
        """True when this quant's product opts into dozens and is measured in
        the Units tree."""
        self.ensure_one()
        if not self.product_id.use_dozen_display:
            return False
        unit = self.env.ref('uom.product_uom_unit', raise_if_not_found=False)
        uom = self.product_uom_id
        return bool(unit and uom and _root_uom(uom) == unit)

    @api.depends('inventory_quantity', 'product_uom_id', 'product_id.use_dozen_display')
    def _compute_dozen_inventory_quantity(self):
        for quant in self:
            if quant._dozen_countable():
                # inventory_quantity is in the product's UoM; convert to pieces
                # (via factor) then to dozens for display.
                pieces = quant.inventory_quantity * quant.product_uom_id.factor
                quant.dozen_inventory_quantity = pieces / PIECES_PER_DOZEN
            else:
                quant.dozen_inventory_quantity = 0.0

    def _set_dozen_inventory_quantity(self):
        # User typed a dozen count -> fill Counted Quantity (inventory_quantity)
        # in the product's UoM. The built-in Apply then records the stock move.
        for quant in self:
            if quant._dozen_countable() and quant.product_uom_id.factor:
                pieces = quant.dozen_inventory_quantity * PIECES_PER_DOZEN
                quant.inventory_quantity = pieces / quant.product_uom_id.factor

    @api.onchange('dozen_inventory_quantity')
    def _onchange_dozen_inventory_quantity(self):
        # Live UI update: as the user types dozens in the editable list, fill the
        # Counted Quantity column immediately (in pieces).
        if self._dozen_countable() and self.product_uom_id.factor:
            pieces = self.dozen_inventory_quantity * PIECES_PER_DOZEN
            self.inventory_quantity = pieces / self.product_uom_id.factor
