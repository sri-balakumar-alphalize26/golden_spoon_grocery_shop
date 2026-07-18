import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

# Factory sizes seeded per company. `key` is the stable reference the app and the
# stored settings use — it must never change once created, hence a separate slug
# rather than keying off the (editable, translatable) name.
FACTORY_SIZES = [
    ('2in', '2 inch', 50, 40, 65),
    ('3in', '3 inch', 76, 60, 85),
    ('35in', '3.5 inch', 80, 70, 95),
    ('4in', '4 inch', 100, 85, 115),
    ('a5', 'A5', 148, 140, 160),
    ('a4', 'A4', 210, 200, 225),
]


class PosInvoicePaperSize(models.Model):
    """A receipt paper size, per company.

    Replaces the six hardcoded `size_mm_*` fields on pos.invoice.settings. Those
    let an admin edit each preset's mm but never add a seventh; sizes are records
    here so a shop can create its own ("8 inch") without a code change.

    `key` stays stable so pos.invoice.settings.default_paper_size and the app's
    size picker keep resolving across renames and mm edits.
    """
    _name = 'pos.invoice.paper.size'
    _description = 'POS Invoice Paper Size'
    _order = 'sequence, width_mm'

    company_id = fields.Many2one(
        'res.company', string='Company', required=True,
        ondelete='cascade', index=True, default=lambda s: s.env.company,
    )
    name = fields.Char(string='Name', required=True, help='Shown in the size picker, e.g. "8 inch".')
    key = fields.Char(
        string='Key', required=True,
        help='Stable identifier used by the app and saved settings. '
             'Auto-filled from the name; avoid changing it once in use.',
    )
    width_mm = fields.Integer(string='Width (mm)', required=True, default=80)
    # 0 = auto/continuous roll. A positive value pins a fixed sheet height, which
    # the old custom_paper_height could never actually do (it was hardcoded to 0).
    height_mm = fields.Integer(
        string='Height (mm)', default=0,
        help='0 = auto (continuous roll). A positive value pins a fixed page height.',
    )
    sequence = fields.Integer(string='Sequence', default=10)
    active = fields.Boolean(string='Active', default=True)
    # The single per-company "Custom" size. Editable like any other, but kept out
    # of the app's preset picker (app_paper_size.presets) so that JSON stays the
    # historic 6-entry shape. Exactly one per company by convention.
    is_custom = fields.Boolean(string='Is Custom', default=False)

    # Optional band. Replaces the hardcoded _SIZE_LIMITS dict; blank = unbounded,
    # which is what a user-created size gets unless they choose to constrain it.
    min_mm = fields.Integer(string='Min (mm)', default=0)
    max_mm = fields.Integer(string='Max (mm)', default=0)

    _sql_constraints = [
        ('key_uniq', 'unique(company_id, key)',
         'A paper size with this key already exists for this company.'),
        ('width_positive', 'CHECK(width_mm > 0)', 'Width must be greater than 0 mm.'),
        ('height_non_negative', 'CHECK(height_mm >= 0)', 'Height cannot be negative.'),
    ]

    @api.constrains('width_mm', 'min_mm', 'max_mm')
    def _check_width_band(self):
        for rec in self:
            if rec.min_mm and rec.width_mm < rec.min_mm:
                raise ValidationError(_(
                    '%(name)s width must be at least %(lo)d mm (got %(val)d).',
                    name=rec.name, lo=rec.min_mm, val=rec.width_mm))
            if rec.max_mm and rec.width_mm > rec.max_mm:
                raise ValidationError(_(
                    '%(name)s width must be at most %(hi)d mm (got %(val)d).',
                    name=rec.name, hi=rec.max_mm, val=rec.width_mm))
            if rec.min_mm and rec.max_mm and rec.min_mm > rec.max_mm:
                raise ValidationError(_('%(name)s: Min mm cannot exceed Max mm.', name=rec.name))

    @api.onchange('name')
    def _onchange_name_fill_key(self):
        """New-record convenience:
        - If the admin types just a number (e.g. "6"), expand it to "6 inch" and
          estimate the width in mm (1 inch = 25.4 mm) so they don't have to know
          the mm — they can still override the width afterwards.
        - Seed the stable key from the (final) name.
        Only for NEW records (no key yet) so an existing size is never re-slugged —
        saved settings and the app resolve by key and must not lose their reference.
        """
        if not self.name or self.key:
            return
        stripped = self.name.strip()
        m = re.fullmatch(r'(\d+(?:\.\d+)?)\s*(?:"|inch|inches|in)?', stripped, re.IGNORECASE)
        if m:
            inches = float(m.group(1))
            # Keep it clean: "6 inch" (drop a trailing .0)
            num = int(inches) if inches == int(inches) else inches
            self.name = '%s inch' % num
            # Only auto-fill the width if still at the default 80, so we don't stomp
            # a width the user already typed.
            if not self.width_mm or self.width_mm == 80:
                self.width_mm = round(inches * 25.4)
        self.key = self._slugify(self.name)

    @api.model_create_multi
    def create(self, vals_list):
        """Every real paper size gets its own editable layout, so a size added here
        appears immediately under Invoice Layouts (no lazy create-on-first-print)."""
        records = super().create(vals_list)
        Layout = self.env['pos.invoice.layout'].sudo()
        for rec in records:
            if rec.company_id and not rec.is_custom:
                Layout.resolve_for(rec.company_id, rec)
        return records

    @api.model
    def _slugify(self, value):
        out = ''.join(c.lower() if c.isalnum() else '_' for c in (value or ''))
        while '__' in out:
            out = out.replace('__', '_')
        return out.strip('_') or 'size'

    @api.model
    def seed_for_company(self, company):
        """Create the six factory sizes plus a 'custom' size for `company` if
        missing.

        Idempotent: only fills gaps by key, so it is safe to call from
        get_for_company() on every settings resolve.
        """
        existing = set(self.sudo().search([('company_id', '=', company.id)]).mapped('key'))
        vals = [
            {
                'company_id': company.id, 'key': key, 'name': label,
                'width_mm': mm, 'height_mm': 0,
                'min_mm': lo, 'max_mm': hi, 'sequence': (i + 1) * 10,
            }
            for i, (key, label, mm, lo, hi) in enumerate(FACTORY_SIZES)
            if key not in existing
        ]
        if 'custom' not in existing:
            vals.append({
                'company_id': company.id, 'key': 'custom', 'name': 'Custom',
                'width_mm': 80, 'height_mm': 0, 'is_custom': True, 'sequence': 100,
            })
        return self.sudo().create(vals) if vals else self.browse()
