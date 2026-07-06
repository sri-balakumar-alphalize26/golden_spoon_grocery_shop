from odoo import fields, models


def compute_size_css(width):
    """Width-derived CSS values, same logic as invoiceHtml.js:73-85 and the
    pos_receipt_preview module.

    Returns the receipt body width, the @page size token and the signature
    image max-height for the given paper width (mm). Shared by the wizard and
    the app render path so both produce identical output.
    """
    width = int(width or 80)
    receipt_width = max(10, width - 8)  # 4mm margin x 2, like the app
    # Every size uses a fixed width + auto height so the receipt renders as ONE
    # continuously-growing page. Named sheets (A4/A5) have a fixed physical
    # height, which split a tall receipt across 2 pages on Download/Print — the
    # `<width>mm auto` form avoids that for all sizes (matches the app Preview).
    page_size_css = '%dmm auto' % width
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

    # The exact six sizes from the app's PaperSizeModal (mm), 80mm default.
    paper_size = fields.Selection([
        ('50', '2 inch (50 mm)'),
        ('76', '3 inch (76 mm)'),
        ('80', '3.5 inch (80 mm)'),
        ('100', '4 inch (100 mm)'),
        ('148', 'A5 (148 mm)'),
        ('210', 'A4 (210 mm)'),
    ], string='Receipt Size', default='80', required=True)

    def _render_context(self):
        """Width-derived CSS + the order's dynamic receipt payload. Called from
        the QWeb template per wizard record."""
        self.ensure_one()
        context = compute_size_css(self.paper_size)
        context['d'] = self.order_id.get_dynamic_receipt_data()
        return context

    def action_preview(self):
        """Render the dynamic receipt via the standard Odoo report."""
        self.ensure_one()
        return self.env.ref('pos_dynamic_invoice.action_report_pos_dynamic_invoice').report_action(self)
