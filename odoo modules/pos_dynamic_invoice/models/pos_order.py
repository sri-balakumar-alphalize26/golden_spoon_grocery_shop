import base64
import re

from odoo import fields, models
from odoo.tools.image import image_process


class PosOrder(models.Model):
    """Dynamic-invoice support for pos.order.

    Builds the receipt payload server-side (ported from the app's
    buildInvoiceParams + src/utils/invoiceHtml.js, same shape as the
    pos_receipt_preview module) and then layers the admin-editable
    pos.invoice.settings branding on top (logo, brand name, GST, header/footer,
    terms). Exposes get_dynamic_receipt_html() so the mobile app can fetch the
    rendered receipt HTML for any of the six paper sizes.

    No new stored fields are added — order data is read from existing
    pos.order / pos.order.line / pos.payment records plus the signature
    ir.attachment rows the app already writes.
    """
    _inherit = 'pos.order'

    # ------------------------------------------------------------------
    # Backend button -> open the paper-size popup
    # ------------------------------------------------------------------
    def action_open_dynamic_receipt_preview(self):
        """Preview the dynamic receipt for this order.

        When the company has a default receipt size set (Invoice Settings →
        Receipt Size), skip the 'choose size' popup and render straight at that
        size — mirroring the app, which also skips its size prompt. Otherwise
        open the size wizard as before.
        """
        self.ensure_one()
        settings = self.env['pos.invoice.settings'].get_for_company(
            self.company_id or self.env.company)
        if settings.use_default_paper_size:
            # `default_paper_size` is now a KEY; resolve it to mm and always
            # render via the custom path (the wizard Selection only knows the
            # fixed preset strings, not an edited mm).
            width, height = settings._resolved_default()
            wizard = self.env['pos.dynamic.invoice.wizard'].create({
                'order_id': self.id,
                'paper_size': 'custom',
                'custom_width': width,
                'custom_height': height,
            })
            return wizard.action_preview()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Preview Receipt (Dynamic)',
            'res_model': 'pos.dynamic.invoice.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_order_id': self.id},
        }

    # ------------------------------------------------------------------
    # Money / ref / signature helpers (ports of the app + pos_receipt_preview)
    # ------------------------------------------------------------------
    def _receipt_money_formatter(self):
        """Return fn(amount) -> 'symbol 0.000', matching formatCurrencyHtml."""
        currency = self.currency_id or self.company_id.currency_id
        digits = currency.decimal_places if currency else 2
        symbol = (currency.symbol or currency.name or '') if currency else ''

        def _fmt(amount):
            try:
                value = float(amount or 0.0)
            except (TypeError, ValueError):
                value = 0.0
            text = ('{:.%df}' % digits).format(value)
            return ('%s %s' % (symbol, text)) if symbol else text

        return _fmt

    @staticmethod
    def _extract_order_ref(order_name, order_id):
        """Port of extractOrderRef: trailing digits of the name, else padded id."""
        if order_name:
            match = re.search(r'(\d+)\s*$', str(order_name))
            if match:
                return match.group(1)
        return str(order_id or '').rjust(6, '0')

    def _receipt_signatures(self):
        """Read the two signature attachments (base64 PNG, no data: prefix)."""
        sig = {'customer_signature': False, 'shop_owner_signature': False}
        attachments = self.env['ir.attachment'].sudo().search([
            ('res_model', '=', 'pos.order'),
            ('res_id', '=', self.id),
            ('name', 'in', ['customer_signature', 'shop_owner_signature']),
        ])
        for attachment in attachments:
            raw = attachment.datas
            if not raw:
                continue
            sig[attachment.name] = raw.decode() if isinstance(raw, bytes) else raw
        return sig

    # ------------------------------------------------------------------
    # Order payload (before settings) — ports buildInvoiceParams
    # ------------------------------------------------------------------
    def _base_receipt_data(self):
        """Build the receipt dict from order data only (no branding overrides).

        Company block exposes `address_lines` (a list) so the template can loop
        it regardless of whether the address comes from res.company or the
        settings free-text field.
        """
        self.ensure_one()
        fmt = self._receipt_money_formatter()
        company = self.company_id or self.env.company

        city_state_zip = ', '.join(
            p for p in [company.city, company.state_id.name if company.state_id else None, company.zip] if p
        )
        address_lines = [
            line for line in [
                company.street, company.street2, city_state_zip,
                company.country_id.name if company.country_id else None,
            ] if line
        ]
        company_block = {
            'name': company.name or 'Company',
            'address_lines': address_lines,
            'phone': company.phone or '',
            'email': company.email or '',
        }

        items = []
        raw_subtotal = 0.0
        for index, line in enumerate(self.lines):
            qty = float(line.qty or 0.0)
            unit = float(line.price_unit or 0.0)
            gross = unit * qty
            raw_subtotal += gross
            discount_pct = float(line.discount or 0.0)
            item_discount = gross * discount_pct / 100.0
            line_total = line.price_subtotal_incl
            if line_total is False or line_total is None:
                line_total = line.price_subtotal
            items.append({
                'num': index + 1,
                'name': line.full_product_name or (line.product_id.display_name if line.product_id else '') or 'Product',
                'qty': ('%g' % qty),
                'unit_f': fmt(unit),
                'disc_f': ('-%s' % fmt(item_discount)) if item_discount > 0 else '0',
                'total_f': fmt(line_total),
                'note': line.customer_note or '',
            })

        amount_total = float(self.amount_total or 0.0)
        amount_tax = float(self.amount_tax or 0.0)
        amount_paid = float(self.amount_paid or 0.0)
        rolled_discount = max(0.0, round((raw_subtotal - (amount_total - amount_tax)) * 1000) / 1000.0)

        payments = []
        for payment in self.payment_ids:
            payments.append({
                'name': payment.payment_method_id.name if payment.payment_method_id else 'Payment',
                'amount_f': fmt(payment.amount or 0.0),
            })
        has_payments = bool(payments)
        change_amount = amount_paid - amount_total if amount_paid > amount_total else 0.0

        date_str = ''
        if self.date_order:
            local_dt = fields.Datetime.context_timestamp(self, self.date_order)
            date_str = local_dt.strftime('%d/%m/%Y')

        signatures = self._receipt_signatures()

        return {
            'company': company_block,
            'customer': self.partner_id.name if self.partner_id else '',
            'cashier': self.user_id.name if self.user_id else 'Cashier',
            'order_ref': self._extract_order_ref(self.name, self.id),
            'date': date_str,
            'items': items,
            'subtotal_f': fmt(raw_subtotal or amount_total),
            'show_discount': rolled_discount > 0,
            'discount_f': fmt(rolled_discount),
            'show_tax': amount_tax > 0,
            'tax_f': fmt(amount_tax),
            'total_f': fmt(amount_total or raw_subtotal),
            'has_payments': has_payments,
            'is_split': len(payments) > 1,
            'payments': payments,
            'show_change': has_payments and change_amount > 0,
            'change_f': fmt(change_amount),
            'cash_f': fmt(amount_paid if amount_paid > 0 else amount_total),
            'cash_change_f': fmt(amount_paid - amount_total if amount_paid > amount_total else 0.0),
            'customer_signature': signatures['customer_signature'],
            'shop_owner_signature': signatures['shop_owner_signature'],
        }

    # ------------------------------------------------------------------
    # Dynamic payload — base data + admin settings branding
    # ------------------------------------------------------------------
    def get_dynamic_receipt_data(self):
        """Base receipt data with pos.invoice.settings branding layered on top.

        Every branding override is fallback-safe: a blank settings field leaves
        the res.company-derived value in place.
        """
        self.ensure_one()
        data = self._base_receipt_data()
        company = self.company_id or self.env.company
        settings = self.env['pos.invoice.settings'].get_for_company(company)

        # Common keys the dispatcher + Cash Memo template read (present in EVERY
        # branch, including the normal-mode early return below).
        data['invoice_template'] = settings.invoice_template
        data['company_name_ar'] = settings.company_name_ar or ''
        # Custom English name for the Cash Memo; blank -> the company's own name.
        data['company_name_en'] = settings.company_name_en or company.name or ''
        data['cr_number'] = settings.cr_number or ''
        data['po_box'] = settings.po_box or ''
        data['postal_code'] = settings.postal_code or ''
        data['gsm_mobile'] = settings.gsm or ''
        data['vat_no'] = settings.vat_no or ''
        data['show_cm_name'] = settings.show_cm_name
        data['show_cm_cr'] = settings.show_cm_cr
        data['show_cm_pobox'] = settings.show_cm_pobox
        data['show_cm_postal'] = settings.show_cm_postal
        data['show_cm_sultanate'] = settings.show_cm_sultanate
        data['show_cm_gsm'] = settings.show_cm_gsm
        data['show_cm_vat'] = settings.show_cm_vat
        currency = self.currency_id or company.currency_id
        fmt = self._receipt_money_formatter()
        try:
            data['amount_in_words'] = currency.amount_to_text(self.amount_total or 0.0)
        except Exception:
            data['amount_in_words'] = ''
        data['advance_f'] = fmt(self.amount_paid or 0.0)
        data['due_f'] = fmt((self.amount_total or 0.0) - (self.amount_paid or 0.0))
        partner = self.partner_id
        data['customer_address'] = ', '.join(
            p for p in [getattr(partner, 'street', ''), getattr(partner, 'street2', ''), getattr(partner, 'city', '')] if p
        ) if partner else ''

        # NORMAL MODE (switch OFF): render the plain receipt — the same look as
        # the app's built-in HTML receipt (res.company details, default title/
        # footer, no logo, no VAT line, no terms). So the backend preview shows
        # "normal when off, dynamic when on", matching the app.
        if not settings.use_dynamic_invoice:
            data['vat_number'] = ''
            data['show_logo'] = False
            data['logo'] = ''
            data['header_title'] = 'INVOICE / فاتورة'
            data['footer_text'] = 'Thank you for your purchase!\nشكرا لشرائك!'
            data['footer_lines'] = data['footer_text'].split('\n')
            data['show_customer_sig'] = bool(data.get('customer_signature'))
            data['show_shop_owner_sig'] = bool(data.get('shop_owner_signature'))
            data['show_footer'] = True
            return data

        block = data['company']
        # Company name always comes from res.company (no separate brand field).
        if settings.address:
            block['address_lines'] = [line for line in settings.address.splitlines() if line.strip()]
        if settings.phone:
            block['phone'] = settings.phone
        if settings.email:
            block['email'] = settings.email

        raw_logo = settings.logo
        data['vat_number'] = settings.vat_number or company.vat or ''
        data['show_logo'] = bool(settings.show_logo and raw_logo)
        # Downscale the logo before embedding. The receipt shows it at most
        # ~90px tall, so a 512px box stays crisp for screen + print while cutting
        # a multi-MB original down to tens of KB (a full-res logo otherwise
        # bloats every receipt and can hang on-device PDF generation). Binary
        # fields hold base64, but image_process wants raw bytes: decode →
        # resize → PNG re-encode → base64. Aspect ratio is preserved; any
        # processing error falls back to the original image.
        logo_b64 = raw_logo
        if raw_logo:
            try:
                resized = image_process(base64.b64decode(raw_logo), size=(512, 512), output_format='PNG')
                logo_b64 = base64.b64encode(resized)
            except Exception:
                logo_b64 = raw_logo
        data['logo'] = (logo_b64.decode() if isinstance(logo_b64, bytes) else logo_b64) or ''
        data['header_title'] = settings.header_title or 'INVOICE / فاتورة'
        data['footer_text'] = settings.footer_text or 'Thank you for your purchase!\nشكرا لشرائك!'
        data['footer_lines'] = (data['footer_text'] or '').split('\n')
        # Combine the admin toggle with the order actually carrying tax.
        data['show_tax'] = bool(settings.show_tax and data.get('show_tax'))
        # Per-side signature toggles: show a signature only when its toggle is
        # on AND one was actually captured for that side.
        data['show_customer_sig'] = bool(settings.show_customer_signature and data.get('customer_signature'))
        data['show_shop_owner_sig'] = bool(settings.show_shop_owner_signature and data.get('shop_owner_signature'))
        data['show_footer'] = bool(settings.show_footer and data.get('footer_text'))
        return data

    # ------------------------------------------------------------------
    # App entry point — rendered receipt HTML for a chosen paper size
    # ------------------------------------------------------------------
    def get_dynamic_receipt_html(self, paper_size='80', paper_height=0):
        """Return the dynamic receipt as a self-contained HTML string for
        `paper_size` (mm width) and optional `paper_height` (mm; 0 = auto).
        Called by the React Native app over JSON-RPC.

        Renders ONLY the receipt body template (inline <style> + base64 images,
        no /web/assets bundles) wrapped in a minimal <html> document, so the app
        prints/downloads it instantly. The backend report (report_action) is a
        separate wrapper that adds web.basic_layout for the in-Odoo preview — we
        deliberately don't use it here because its asset <link>/<script> tags
        never load on-device and hang the print engine.
        """
        self.ensure_one()
        try:
            height = int(paper_height or 0)
        except (TypeError, ValueError):
            height = 0
        # The app always sends a numeric width (mm) — presets are resolved to
        # their configured mm server-side. Always render via the custom path so
        # any width works (the wizard Selection only knows the fixed presets).
        try:
            width = int(paper_size)
        except (TypeError, ValueError):
            width = 80
        wiz_vals = {
            'order_id': self.id,
            'paper_size': 'custom',
            'custom_width': width,
            'custom_height': height,
        }
        wizard = self.env['pos.dynamic.invoice.wizard'].create(wiz_vals)
        values = wizard._render_context()
        body = self.env['ir.qweb']._render('pos_dynamic_invoice.report_pos_dynamic_invoice_doc', values)
        body = body.decode() if isinstance(body, bytes) else body
        return (
            '<!doctype html><html><head><meta charset="utf-8"/>'
            '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
            '</head><body style="margin:0;padding:0;">%s</body></html>' % body
        )
