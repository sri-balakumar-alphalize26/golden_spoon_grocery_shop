from odoo import api, fields, models
from odoo.exceptions import ValidationError

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

    @api.model
    def app_dynamic_enabled(self):
        """Return True when the mobile app should render the dynamic invoice for
        the current user's company — i.e. this module is installed AND the
        'Use Dynamic Invoice on App' switch is on. The app calls this at
        login/launch/foreground and caches the result; a missing model (module
        not installed) makes the RPC error and the app falls back to False.
        """
        return bool(self.get_for_company(self.env.company).use_dynamic_invoice)

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
