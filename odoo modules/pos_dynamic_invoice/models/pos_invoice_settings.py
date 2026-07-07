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
    # Same six sizes as the app's PaperSizeModal / the wizard's paper_size.
    default_paper_size = fields.Selection([
        ('50', '2 inch (50 mm)'),
        ('76', '3 inch (76 mm)'),
        ('80', '3.5 inch (80 mm)'),
        ('100', '4 inch (100 mm)'),
        ('148', 'A5 (148 mm)'),
        ('210', 'A4 (210 mm)'),
    ], string='Default Receipt Size', default='80')

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
        result = {
            'use_default': bool(rec.use_default_paper_size),
            'size': rec.default_paper_size or '80',
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
