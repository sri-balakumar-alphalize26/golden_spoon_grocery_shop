import re

from odoo import models, fields


class PosOrder(models.Model):
    """Backend receipt-preview support for pos.order.

    Mirrors the React Native app's receipt: the app builds the same data in
    src/screens/MyOrders/OrderDetailScreen.js (buildInvoiceParams) and renders
    it via src/utils/invoiceHtml.js (generateInvoiceHtml). This reproduces that
    data server-side so the Odoo backend can render an identical receipt.

    No new stored fields are added — everything is read from existing
    pos.order / pos.order.line / pos.payment records, plus the signature
    ir.attachment rows the app already writes (res_model='pos.order',
    name in ['customer_signature', 'shop_owner_signature']).
    """
    _inherit = 'pos.order'

    # ------------------------------------------------------------------
    # Header button -> open the paper-size popup
    # ------------------------------------------------------------------
    def action_open_receipt_preview(self):
        """Open the 'choose receipt size' wizard as a modal for this order."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Preview Receipt',
            'res_model': 'pos.receipt.preview.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_order_id': self.id},
        }

    # ------------------------------------------------------------------
    # Receipt data mapper (ports buildInvoiceParams + invoiceHtml prep)
    # ------------------------------------------------------------------
    def _receipt_money_formatter(self):
        """Return a fn(amount) -> 'symbol 0.000' string, matching the app's
        formatCurrencyHtml (symbol + space + fixed decimals)."""
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
        """Port of extractOrderRef: trailing digits of the order name, or a
        zero-padded id fallback (e.g. 'Shop - 000004' -> '000004')."""
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

    def get_receipt_render_data(self):
        """Build the full dict the QWeb receipt template renders.

        Money values are pre-formatted strings (the template stays dumb), while
        booleans drive the same conditional rows as the app's receipt.
        """
        self.ensure_one()
        fmt = self._receipt_money_formatter()
        company = self.company_id or self.env.company

        # --- Company letterhead (res.company), same fields the app fetches ---
        city_state_zip = ', '.join(
            p for p in [company.city, company.state_id.name if company.state_id else None, company.zip] if p
        )
        company_block = {
            'name': company.name or 'Company',
            'street': company.street or '',
            'street2': company.street2 or '',
            'city_state_zip': city_state_zip,
            'country': company.country_id.name if company.country_id else '',
            'phone': company.phone or '',
            'email': company.email or '',
        }

        # --- Line items (port of buildInvoiceParams items map) ---
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
        # Rolled-up discount: same formula as the app (raw - net-of-tax).
        rolled_discount = max(0.0, round((raw_subtotal - (amount_total - amount_tax)) * 1000) / 1000.0)

        # --- Payments (one row per pos.payment) ---
        payments = []
        for payment in self.payment_ids:
            payments.append({
                'name': payment.payment_method_id.name if payment.payment_method_id else 'Payment',
                'amount_f': fmt(payment.amount or 0.0),
            })
        has_payments = bool(payments)
        change_amount = amount_paid - amount_total if amount_paid > amount_total else 0.0

        # Date: use the order's real date (in the user's timezone), formatted
        # dd/mm/yyyy to match the app receipt's en-GB date.
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
            # Fallback cash block (when no pos.payment rows exist), mirrors app.
            'cash_f': fmt(amount_paid if amount_paid > 0 else amount_total),
            'cash_change_f': fmt(amount_paid - amount_total if amount_paid > amount_total else 0.0),
            'customer_signature': signatures['customer_signature'],
            'shop_owner_signature': signatures['shop_owner_signature'],
        }
