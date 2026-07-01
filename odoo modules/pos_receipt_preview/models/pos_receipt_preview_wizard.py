from odoo import models, fields


def compute_size_css(width):
    """Width-derived CSS values, same logic as invoiceHtml.js:73-85.

    Returns receipt body width, the @page size token and the signature image
    max-height for the given paper width (mm). Shared by the wizard and the
    receipt controller so both render identically.
    """
    width = int(width or 80)
    receipt_width = max(10, width - 8)  # 4mm margin x 2, like the app
    if width == 210:
        page_size_css = 'A4'
    elif width == 148:
        page_size_css = 'A5'
    else:
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


class PosReceiptPreviewWizard(models.TransientModel):
    """The 'choose receipt size' popup.

    Holds the target order and the selected paper width, then renders the
    receipt through the standard Odoo report (qweb-html), so the preview shows
    embedded in Odoo and the report toolbar's Print/Download uses the normal
    Odoo flow.
    """
    _name = 'pos.receipt.preview.wizard'
    _description = 'POS Receipt Preview (paper size picker)'

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
        """All values the receipt template renders: width-derived CSS + the
        order's receipt payload. Called from the QWeb template per wizard."""
        self.ensure_one()
        context = compute_size_css(self.paper_size)
        context['d'] = self.order_id.get_receipt_render_data()
        return context

    def action_preview(self):
        """Render the receipt via the standard Odoo report at the chosen size."""
        self.ensure_one()
        return self.env.ref('pos_receipt_preview.action_report_pos_receipt').report_action(self)
