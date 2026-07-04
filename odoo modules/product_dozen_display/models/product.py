from odoo import api, fields, models

# Fallback pack size when a product has no explicit value (1 Dozen = 12 pieces).
PIECES_PER_DOZEN = 12


def _pack_size(record):
    """Pieces that make one "dozen" for this product (per-product, default 12)."""
    return int(record.dozen_pack_size) or PIECES_PER_DOZEN


def _format_dozen(pieces, pack):
    """Turn a piece count into a "X Dozen Y Pcs" label for the given pack size.

    pack=12: 108 -> "9 Dozen", 115 -> "9 Dozen 7 Pcs", 7 -> "7 Pcs", 0 -> "0 Pcs".
    """
    pieces = int(round(pieces or 0))
    pack = pack or PIECES_PER_DOZEN
    dozens, loose = divmod(pieces, pack)
    parts = []
    if dozens:
        parts.append("%d Dozen" % dozens)
    if loose or not dozens:
        parts.append("%d Pcs" % loose)
    return " ".join(parts)


def _root_uom(uom):
    """Walk the relative-unit chain to the root reference unit (Odoo 19)."""
    while uom and uom.relative_uom_id:
        uom = uom.relative_uom_id
    return uom


def _is_dozen_countable(record):
    """True when the product's UoM lives in the Units reference tree."""
    unit = record.env.ref('uom.product_uom_unit', raise_if_not_found=False)
    uom = record.uom_id
    return bool(unit and uom and _root_uom(uom) == unit)


def _pieces_for(record):
    """On-hand count in single pieces, or None if not a count-based product.

    qty_available is in the product's own UoM; convert via uom.factor. Returns
    None when the per-product Dozen toggle is off, so the dozen fields stay blank.
    """
    if record.use_dozen_display and _is_dozen_countable(record):
        return int(round(record.qty_available * record.uom_id.factor))
    return None


def _compute_displays(records):
    for rec in records:
        pieces = _pieces_for(rec)
        if pieces is None:
            rec.dozen_display = False
            rec.piece_display = False
        else:
            rec.dozen_display = _format_dozen(pieces, _pack_size(rec))
            rec.piece_display = "%d Pcs" % pieces


def _compute_onhand_dozens(records):
    for rec in records:
        pieces = _pieces_for(rec)
        rec.dozen_qty_onhand = (pieces / _pack_size(rec)) if pieces is not None else 0.0


def _push_dozens_to_qty(records):
    # Typing dozens fills Quantity On Hand (qty_available) in the product's UoM;
    # qty_available's own inverse records the inventory adjustment on save. Works
    # for a single record (onchange) or a recordset (inverse on save).
    for record in records:
        if record.use_dozen_display and _is_dozen_countable(record) and record.uom_id.factor:
            pieces = record.dozen_qty_onhand * _pack_size(record)
            record.qty_available = pieces / record.uom_id.factor


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    use_dozen_display = fields.Boolean(
        string='Dozen Display',
        help='When enabled, show and allow editing the on-hand quantity in '
             'dozens for this product.',
    )
    dozen_pack_size = fields.Integer(
        string='Pieces per Dozen', default=PIECES_PER_DOZEN,
        help='How many single pieces make one "dozen" for this product '
             '(default 12). Used for all the dozen conversions.',
    )
    dozen_display = fields.Char(
        string='On Hand (Dozen + Pcs)', compute='_compute_dozen_display',
        help='On-hand quantity shown as full dozens plus the loose remainder '
             '(1 Dozen = 12).',
    )
    piece_display = fields.Char(
        string='On Hand (Pieces)', compute='_compute_dozen_display',
        help='On-hand quantity as a total number of single pieces.',
    )
    dozen_qty_onhand = fields.Float(
        string='On Hand (Dozens)', compute='_compute_dozen_qty_onhand',
        inverse='_inverse_dozen_qty_onhand', readonly=False,
        help='Type the on-hand quantity in dozens; Quantity On Hand fills in as '
             'dozens x 12 (saved as an inventory adjustment).',
    )

    @api.depends('qty_available', 'uom_id', 'use_dozen_display', 'dozen_pack_size')
    def _compute_dozen_display(self):
        _compute_displays(self)

    @api.depends('qty_available', 'uom_id', 'use_dozen_display', 'dozen_pack_size')
    def _compute_dozen_qty_onhand(self):
        _compute_onhand_dozens(self)

    def _inverse_dozen_qty_onhand(self):
        _push_dozens_to_qty(self)

    @api.onchange('dozen_qty_onhand')
    def _onchange_dozen_qty_onhand(self):
        _push_dozens_to_qty(self)


class ProductProduct(models.Model):
    _inherit = 'product.product'

    dozen_display = fields.Char(
        string='On Hand (Dozen + Pcs)', compute='_compute_dozen_display',
        help='On-hand quantity shown as full dozens plus the loose remainder '
             '(1 Dozen = 12).',
    )
    piece_display = fields.Char(
        string='On Hand (Pieces)', compute='_compute_dozen_display',
        help='On-hand quantity as a total number of single pieces.',
    )
    dozen_qty_onhand = fields.Float(
        string='On Hand (Dozens)', compute='_compute_dozen_qty_onhand',
        inverse='_inverse_dozen_qty_onhand', readonly=False,
        help='Type the on-hand quantity in dozens; Quantity On Hand fills in as '
             'dozens x 12 (saved as an inventory adjustment).',
    )

    @api.depends('qty_available', 'uom_id', 'use_dozen_display', 'dozen_pack_size')
    def _compute_dozen_display(self):
        _compute_displays(self)

    @api.depends('qty_available', 'uom_id', 'use_dozen_display', 'dozen_pack_size')
    def _compute_dozen_qty_onhand(self):
        _compute_onhand_dozens(self)

    def _inverse_dozen_qty_onhand(self):
        _push_dozens_to_qty(self)

    @api.onchange('dozen_qty_onhand')
    def _onchange_dozen_qty_onhand(self):
        _push_dozens_to_qty(self)
