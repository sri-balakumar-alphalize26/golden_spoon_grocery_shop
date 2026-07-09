import logging

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError

_logger = logging.getLogger(__name__)

# Defaults used when a company's settings record is first auto-created. The
# header title / footer text mirror the hardcoded strings the app's built-in
# receipt uses (src/utils/invoiceHtml.js), so an out-of-the-box dynamic invoice
# looks identical to the static one until the admin customises it.
DEFAULT_HEADER_TITLE = 'INVOICE / فاتورة'
DEFAULT_FOOTER_TEXT = 'Thank you for your purchase!\nشكرا لشرائك!'


class PosInvoiceSettings(models.Model):
    """Per-company branding for the dynamic POS invoice.

    One record per company (auto-created on demand via get_for_company). Every
    branding field is optional: a blank field falls back to the matching
    res.company value at render time, so the receipt is never worse than the
    static one even before the admin fills anything in.
    """
    _name = 'pos.invoice.settings'
    _description = 'POS Dynamic Invoice Settings'

    # No default company: on the Odoo "New" form the admin must pick a company
    # from the dropdown (so it won't preselect one that already has a record and
    # immediately trip the one-per-company constraint). get_for_company() and the
    # app always pass company_id explicitly, so they're unaffected.
    company_id = fields.Many2one(
        'res.company', string='Company', required=True,
        ondelete='cascade', index=True,
    )

    # Master switch the app reads (via app_dynamic_enabled). OFF (default) means
    # the app keeps showing its normal built-in receipt even though this module
    # is installed; ON makes the app render this dynamic invoice. Lets a client
    # install the module but stay on the normal receipt until they opt in.
    use_dynamic_invoice = fields.Boolean(
        string='Use Dynamic Invoice on App', default=False,
        help='When off, the app shows its normal built-in receipt even though '
             'this module is installed. Turn on to render this dynamic invoice.',
    )

    # 3-way template the app reads via app_dynamic_enabled:
    #   html      -> the app shows its normal built-in receipt (no server render)
    #   dynamic   -> the branded dynamic receipt (standard body)
    #   cash_memo -> the bilingual Oman Cash Memo invoice
    # `use_dynamic_invoice` is kept in sync (True for dynamic/cash_memo) for any
    # older readers.
    invoice_template = fields.Selection([
        ('html', 'Standard'),
        ('dynamic', 'Dynamic'),
        ('cash_memo', 'Cash Memo'),
    ], string='Invoice Template', default='html')

    # --- Cash Memo header (bilingual Oman invoice; shown when the template is
    # 'cash_memo'). Defaults from the reference memo; each shop can edit them. ---
    company_name_ar = fields.Char(string='Company Name (Arabic)', default='منارة الخوض للأعمال ش ش و')
    # English company name for the Cash Memo header. Blank -> falls back to the
    # company's own name (res.company).
    company_name_en = fields.Char(string='Company Name (English)')
    cr_number = fields.Char(string='C.R. Number', default='1410246')
    po_box = fields.Char(string='P.O Box', default='112')
    postal_code = fields.Char(string='Postal Code', default='111')
    gsm = fields.Char(string='GSM / Mobile', default='77576196')

    # Per-field show/hide for the Cash Memo header lines (both EN + AR columns).
    show_cm_name = fields.Boolean(string='Show Company Name', default=True)
    show_cm_cr = fields.Boolean(string='Show C.R. Number', default=True)
    show_cm_pobox = fields.Boolean(string='Show P.O Box', default=True)
    show_cm_postal = fields.Boolean(string='Show Postal Code', default=True)
    show_cm_sultanate = fields.Boolean(string='Show Sultanate of Oman', default=True)
    show_cm_gsm = fields.Boolean(string='Show GSM / Mobile', default=True)

    # --- Branding (each falls back to res.company when blank) ---
    address = fields.Text(string='Address', help='Free-text address; one line per row.')
    phone = fields.Char(string='Phone')
    email = fields.Char(string='Email')
    vat_number = fields.Char(string='VAT / GST Number')

    # --- Logo ---
    show_logo = fields.Boolean(string='Show Logo', default=True)
    logo = fields.Binary(string='Invoice Logo')

    # --- Text blocks ---
    header_title = fields.Char(string='Header Title', default=DEFAULT_HEADER_TITLE)
    footer_text = fields.Text(string='Footer Text', default=DEFAULT_FOOTER_TEXT)

    # --- Toggles ---
    show_tax = fields.Boolean(
        string='Show Tax Row', default=True,
        help='When off, the Tax line is hidden even if the order carries tax.',
    )
    show_customer_signature = fields.Boolean(
        string='Show Customer Signature', default=True,
        help='When off, the customer signature is hidden even if one was captured.',
    )
    show_shop_owner_signature = fields.Boolean(
        string='Show Cashier Signature', default=True,
        help='When off, the cashier signature is hidden even if one was captured.',
    )
    show_footer = fields.Boolean(
        string='Show Footer', default=True,
        help='When off, the footer text (e.g. "Thank you for your purchase!") is hidden.',
    )

    # --- Default receipt size (applies to BOTH the dynamic and the normal
    # receipt) ---
    # When on, the app skips its paper-size prompt on Preview / Download / Print
    # and renders at `default_paper_size` (mm). Independent of use_dynamic_invoice
    # so it works even when the app is on its built-in receipt.
    use_default_paper_size = fields.Boolean(
        string='Use Default Receipt Size', default=False,
        help='When on, the app prints at the size below without asking each time. '
             'Applies whether the app shows the dynamic or the normal receipt.',
    )
    # The default size is a stable KEY (not the mm), so each preset's mm can be
    # edited below without changing the stored value. Dropdown LABELS are built
    # dynamically to show the configured mm — "4 inch (100 mm)" — so the brackets
    # are back and reflect saved edits.
    def _default_paper_size_selection(self):
        rec = self.sudo().search([('company_id', '=', self.env.company.id)], limit=1)

        def g(fld, d):
            return int((getattr(rec, fld) if rec else d) or d)

        return [
            ('2in', '2 inch (%d mm)' % g('size_mm_2in', 50)),
            ('3in', '3 inch (%d mm)' % g('size_mm_3in', 76)),
            ('35in', '3.5 inch (%d mm)' % g('size_mm_35in', 80)),
            ('4in', '4 inch (%d mm)' % g('size_mm_4in', 100)),
            ('a5', 'A5 (%d mm)' % g('size_mm_a5', 148)),
            ('a4', 'A4 (%d mm)' % g('size_mm_a4', 210)),
            ('custom', 'Custom (W × H mm)'),
        ]

    default_paper_size = fields.Selection(
        selection='_default_paper_size_selection',
        string='Default Receipt Size', default='35in')
    # Custom paper size (mm) used when default_paper_size == 'custom'. Height 0
    # means "auto" (continuous roll); a positive value is a fixed sheet height.
    custom_paper_width = fields.Integer(string='Custom Width (mm)', default=80)
    custom_paper_height = fields.Integer(string='Custom Height (mm)', default=0)

    # Editable physical width (mm) of each preset — per company. Defaults match
    # the historic hardcoded values, so nothing changes until an admin edits one.
    size_mm_2in = fields.Integer(string='2 inch (mm)', default=50)
    size_mm_3in = fields.Integer(string='3 inch (mm)', default=76)
    size_mm_35in = fields.Integer(string='3.5 inch (mm)', default=80)
    size_mm_4in = fields.Integer(string='4 inch (mm)', default=100)
    size_mm_a5 = fields.Integer(string='A5 (mm)', default=148)
    size_mm_a4 = fields.Integer(string='A4 (mm)', default=210)

    # Live indicator of the resolved size for the current selection — updates
    # instantly as any preset/custom mm is edited (the dropdown labels only
    # refresh on save/reload).
    default_size_hint = fields.Char(compute='_compute_default_size_hint', string='Selected')

    # preset key -> (mm field, display label). Presets render at auto height.
    _PRESET_FIELD = {
        '2in': ('size_mm_2in', '2 inch'),
        '3in': ('size_mm_3in', '3 inch'),
        '35in': ('size_mm_35in', '3.5 inch'),
        '4in': ('size_mm_4in', '4 inch'),
        'a5': ('size_mm_a5', 'A5'),
        'a4': ('size_mm_a4', 'A4'),
    }

    def _resolved_default(self):
        """Return (width_mm, height_mm) for the selected default size.
        Custom → its own width/height; preset → the configured mm, height 0."""
        self.ensure_one()
        if self.default_paper_size == 'custom':
            # Custom is one continuous page (auto height) — never split.
            return (self.custom_paper_width or 80, 0)
        fld = self._PRESET_FIELD.get(self.default_paper_size)
        if fld:
            return (getattr(self, fld[0]) or 80, 0)
        return (80, 0)

    def _preset_list(self):
        """[{key,label,mm}] of the 6 presets with their configured mm — the app
        uses this to render its 'Choose receipt size' picker dynamically."""
        self.ensure_one()
        return [
            {'key': key, 'label': label, 'mm': int(getattr(self, fld) or 0)}
            for key, (fld, label) in self._PRESET_FIELD.items()
        ]

    @api.onchange('default_paper_size')
    def _onchange_default_paper_size(self):
        """When a preset is picked, seed the Custom Width/Height from its
        configured mm so the admin can switch to Custom and just tweak."""
        if self.default_paper_size and self.default_paper_size != 'custom':
            w, h = self._resolved_default()
            self.custom_paper_width, self.custom_paper_height = w, h

    @api.depends('default_paper_size', 'custom_paper_width', 'custom_paper_height',
                 'size_mm_2in', 'size_mm_3in', 'size_mm_35in',
                 'size_mm_4in', 'size_mm_a5', 'size_mm_a4')
    def _compute_default_size_hint(self):
        for rec in self:
            w, h = rec._resolved_default()
            rec.default_size_hint = ('→ %d × %d mm' % (w, h)) if h else ('→ %d mm' % w)

    # Sensible band per preset so a value stays near its inch (Custom is free).
    _SIZE_LIMITS = {
        'size_mm_2in': (40, 65, '2 inch'),
        'size_mm_3in': (60, 85, '3 inch'),
        'size_mm_35in': (70, 95, '3.5 inch'),
        'size_mm_4in': (85, 115, '4 inch'),
        'size_mm_a5': (140, 160, 'A5'),
        'size_mm_a4': (200, 225, 'A4'),
    }

    @api.onchange('size_mm_2in', 'size_mm_3in', 'size_mm_35in',
                  'size_mm_4in', 'size_mm_a5', 'size_mm_a4')
    def _onchange_clamp_preset_sizes(self):
        """Live guard: if an out-of-range mm is typed, snap it back to the
        nearest allowed value and warn — no need to wait for save."""
        for fld, (lo, hi, label) in self._SIZE_LIMITS.items():
            val = getattr(self, fld)
            if val is None:
                continue
            if val < lo or val > hi:
                clamped = lo if val < lo else hi
                setattr(self, fld, clamped)
                return {'warning': {
                    'title': _('Size out of range'),
                    'message': _(
                        '%(label)s must be between %(lo)d and %(hi)d mm. '
                        'Reset to %(clamped)d.',
                        label=label, lo=lo, hi=hi, clamped=clamped),
                }}

    @api.constrains('size_mm_2in', 'size_mm_3in', 'size_mm_35in',
                    'size_mm_4in', 'size_mm_a5', 'size_mm_a4')
    def _check_preset_sizes(self):
        """Server-side backstop (RPC / direct writes bypass the onchange)."""
        for rec in self:
            for fld, (lo, hi, label) in rec._SIZE_LIMITS.items():
                val = getattr(rec, fld)
                if val < lo or val > hi:
                    raise ValidationError(_(
                        '%(label)s size must be between %(lo)d and %(hi)d mm (got %(val)d).',
                        label=label, lo=lo, hi=hi, val=val))

    def action_reset_preset_sizes(self):
        """Reset ONLY the 6 preset mm values to their factory defaults."""
        self.ensure_one()
        self.write({
            'size_mm_2in': 50, 'size_mm_3in': 76, 'size_mm_35in': 80,
            'size_mm_4in': 100, 'size_mm_a5': 148, 'size_mm_a4': 210,
        })

    _sql_constraints = [
        ('company_uniq', 'unique(company_id)',
         'There can only be one dynamic invoice settings record per company.'),
    ]

    @api.model
    def get_for_company(self, company=None):
        """Return the settings record for `company` (defaults to the current
        company), creating it with defaults if it doesn't exist, so templates
        can always assume a record exists.
        """
        company = company or self.env.company
        record = self.sudo().search([('company_id', '=', company.id)], limit=1)
        if not record:
            record = self.sudo().create({'company_id': company.id})
        return record

    # Keep the legacy `use_dynamic_invoice` flag in sync with the 3-way template
    # so any older reader still works: on = Dynamic or Cash Memo, off = Normal.
    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('invoice_template'):
                vals['use_dynamic_invoice'] = vals['invoice_template'] != 'html'
        return super().create(vals_list)

    def write(self, vals):
        if 'invoice_template' in vals:
            vals = dict(vals, use_dynamic_invoice=(vals['invoice_template'] != 'html'))
        return super().write(vals)

    @api.model
    def app_dynamic_enabled(self):
        """Return True when the mobile app should fetch a server-rendered invoice
        for the current company — i.e. the template is Dynamic OR Cash Memo (not
        Normal/HTML). The app caches this; a missing model (module not installed)
        errors and the app falls back to its built-in receipt.
        """
        return bool(self.get_for_company(self.env.company).invoice_template != 'html')

    @api.model
    def app_paper_size(self):
        """Per-company default receipt size for the mobile app.

        Returns {'use_default': bool, 'size': '80'}: when use_default is on the
        app skips its paper-size prompt on Preview / Download / Print and renders
        at `size` (mm). Company-scoped like app_dynamic_enabled, and independent
        of use_dynamic_invoice so it applies to BOTH the dynamic and the normal
        receipt. A missing model (module absent) makes the RPC error and the app
        falls back to asking each time.
        """
        rec = self.get_for_company(self.env.company)
        width, height = rec._resolved_default()
        result = {
            'use_default': bool(rec.use_default_paper_size),
            'size': str(width),
            'height': int(height),
            # Configured mm for each preset so the app's ad-hoc size picker
            # reflects any edits the admin made.
            'presets': rec._preset_list(),
        }
        _logger.info('[PAPER SIZE] app_paper_size -> %s', result)
        return result

    def action_preview_receipt(self):
        """Header 'Preview' button: render the currently selected template
        against the most recent order for this company, so the admin can see
        the invoice from the settings form itself. Odoo saves the (dirty) form
        before running this object button, so the preview reflects the picked
        template and header fields."""
        self.ensure_one()
        company = self.company_id or self.env.company
        PosOrder = self.env['pos.order']
        # Prefer a real sale (positive total) so the sample doesn't show a
        # negative refund; fall back to any order if that's all there is.
        order = PosOrder.search(
            [('company_id', '=', company.id), ('amount_total', '>', 0)],
            order='date_order desc', limit=1)
        if not order:
            order = PosOrder.search(
                [('company_id', '=', company.id)],
                order='date_order desc', limit=1)
        if not order:
            raise UserError(_(
                'Make at least one sale for %s before previewing the invoice.',
                company.display_name))
        return order.action_open_dynamic_receipt_preview()

    @api.constrains('company_id')
    def _check_one_per_company(self):
        """Enforce a single settings record per company. Odoo 19 ignored the
        old _sql_constraints unique(company_id), which let a duplicate slip in;
        this ORM-level guard blocks it in all versions (e.g. reassigning another
        company's record to one that already has settings)."""
        for record in self:
            if not record.company_id:
                continue
            others = self.sudo().search_count([
                ('company_id', '=', record.company_id.id),
                ('id', '!=', record.id),
            ])
            if others:
                raise ValidationError(
                    "There is already a Dynamic Invoice Settings record for "
                    "company '%s'. Only one is allowed per company." % record.company_id.display_name
                )
