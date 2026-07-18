from odoo import fields, models


def compute_size_css(width, height=0):
    """Width-derived CSS values, same logic as invoiceHtml.js:73-85 and the
    pos_receipt_preview module.

    Returns the receipt body width, the @page size token and the signature
    image max-height for the given paper width (mm). Shared by the wizard and
    the app render path so both produce identical output.

    `height` (mm) is 0 for the presets (auto/continuous height); a positive
    value pins a fixed page height — used by the Custom size.
    """
    width = int(width or 80)
    height = int(height or 0)
    receipt_width = max(10, width - 8)  # 4mm margin x 2, like the app
    # Presets use a fixed width + auto height so the receipt renders as ONE
    # continuously-growing page. Named sheets (A4/A5) have a fixed physical
    # height, which split a tall receipt across 2 pages on Download/Print — the
    # `<width>mm auto` form avoids that. A Custom size may pin an explicit
    # height (`<width>mm <height>mm`).
    page_size_css = ('%dmm %dmm' % (width, height)) if height > 0 else ('%dmm auto' % width)
    if width >= 148:
        sig_max_h = 70
    elif width <= 58:
        sig_max_h = 38
    else:
        sig_max_h = 50
    return {
        'width': width,
        'receipt_width': receipt_width,
        'page_size_css': page_size_css,
        'sig_max_h': sig_max_h,
    }


class PosDynamicInvoiceWizard(models.TransientModel):
    """The 'choose receipt size' popup for the dynamic invoice.

    Holds the target order and the selected paper width, then renders the
    dynamic receipt through the standard Odoo report (qweb-html) so the preview
    embeds in Odoo and the report toolbar's Print/Download work the normal way.
    The same wizard is created transiently by
    pos.order.get_dynamic_receipt_html() to render for the mobile app.
    """
    _name = 'pos.dynamic.invoice.wizard'
    _description = 'POS Dynamic Invoice (paper size picker)'

    order_id = fields.Many2one('pos.order', string='Order', required=True, ondelete='cascade')

    # The exact six sizes from the app's PaperSizeModal (mm), 80mm default, plus
    # a 'custom' option driven by custom_width/custom_height.
    paper_size = fields.Selection([
        ('50', '2 inch (50 mm)'),
        ('76', '3 inch (76 mm)'),
        ('80', '3.5 inch (80 mm)'),
        ('100', '4 inch (100 mm)'),
        ('148', 'A5 (148 mm)'),
        ('210', 'A4 (210 mm)'),
        ('custom', 'Custom (W × H mm)'),
    ], string='Receipt Size', default='80', required=True)
    # Used only when paper_size == 'custom'. Height 0 = auto (continuous roll).
    custom_width = fields.Integer(string='Custom Width (mm)', default=80)
    custom_height = fields.Integer(string='Custom Height (mm)', default=0)

    def _render_context(self):
        """Width-derived CSS + the order's dynamic receipt payload. Called from
        the QWeb template per wizard record."""
        self.ensure_one()
        if self.paper_size == 'custom':
            # Custom is one continuous page (auto height) — never split.
            width, height = (self.custom_width or 80), 0
        else:
            width, height = int(self.paper_size or 80), 0
        context = compute_size_css(width, height)
        context['d'] = self.order_id.get_dynamic_receipt_data()
        # Layout-driven receipt: resolve (and lazily seed) the layout for this
        # company + paper size, so the third dispatcher branch can render it.
        # Only when the settings template is 'layout' — otherwise skip the lookup.
        context['layout'] = False
        if context['d'].get('invoice_template') == 'layout':
            company = self.order_id.company_id or self.env.company
            Size = self.env['pos.invoice.paper.size'].sudo()
            size = Size.search([
                ('company_id', '=', company.id), ('width_mm', '=', width),
            ], limit=1)
            if size:
                context['layout'] = self.env['pos.invoice.layout'].resolve_for(company, size)
        return context

    def action_preview(self):
        """Render the dynamic receipt via the standard Odoo report."""
        self.ensure_one()
        return self.env.ref('pos_dynamic_invoice.action_report_pos_dynamic_invoice').report_action(self)
