import random
from odoo import models, fields, api


class EasyPurchaseBarcodeWizard(models.TransientModel):
    _name = 'easy.purchase.barcode.wizard'
    _description = 'Easy Purchase Barcode Print Wizard'

    line_id = fields.Many2one('easy.purchase.line', string='Purchase Line')
    product_id = fields.Many2one('product.product', string='Product', required=True)
    quantity = fields.Integer(string='Number of Labels', default=1, required=True)

    label_size = fields.Selection([
        ('26x16', '26 x 16 mm'),
        ('38x25', '38 x 25 mm'),
        ('58x39', '58 x 39 mm'),
    ], string='Label Size', default='38x25', required=True)

    price_type = fields.Selection([
        ('retail', 'Retail Price'),
        ('wholesale', 'Wholesale Price'),
        ('both', 'Both (Retail & Wholesale)'),
    ], string='Price Type', default='retail', required=True)

    retail_price = fields.Float(string='Retail Price', digits='Product Price')
    wholesale_price = fields.Float(string='Wholesale Price', digits='Product Price')

    @api.onchange('product_id')
    def _onchange_product_id(self):
        if self.product_id:
            self.retail_price = self.product_id.lst_price
            self.wholesale_price = self.product_id.standard_price

    @api.onchange('line_id')
    def _onchange_line_id(self):
        if self.line_id and self.line_id.product_id:
            self.product_id = self.line_id.product_id
            self.quantity = int(self.line_id.quantity) or 1

    def action_print(self):
        self.ensure_one()
        # Auto-generate barcode if missing
        if self.product_id and not self.product_id.barcode:
            self.product_id.barcode = ''.join([str(random.randint(0, 9)) for _ in range(13)])
        return self.env.ref('easy_purchase.action_report_easy_purchase_barcode').report_action(self)


class EasyPurchaseBarcodeReport(models.AbstractModel):
    _name = 'report.easy_purchase.report_barcode_label'
    _description = 'Easy Purchase Barcode Label Report'

    @api.model
    def _get_report_values(self, docids, data=None):
        wizard = self.env['easy.purchase.barcode.wizard'].browse(docids)
        products = []
        quantity = 1
        company_name = ''
        label_size = '38x25'
        price_type = 'retail'

        for w in wizard:
            product = w.product_id
            if product:
                company = w.line_id.purchase_id.company_id if w.line_id and w.line_id.purchase_id else self.env.company
                company_name = company.name or ''
                label_size = w.label_size or '38x25'
                price_type = w.price_type or 'retail'

                # Currency
                currency = company.currency_id
                currency_name = currency.name if currency else 'OMR'

                # Prices from wizard (user can override)
                retail_price = w.retail_price or product.lst_price
                wholesale_price = w.wholesale_price or product.standard_price

                # VAT
                vat_percent = 0
                taxes = product.taxes_id
                if w.line_id and w.line_id.tax_ids:
                    taxes = w.line_id.tax_ids
                if taxes:
                    for tax in taxes:
                        if tax.amount_type == 'percent':
                            vat_percent = tax.amount
                            break

                products.append({
                    'id': product.id,
                    'name': product.display_name,
                    'barcode': product.barcode or '',
                    'retail_price': retail_price,
                    'wholesale_price': wholesale_price,
                    'currency_name': currency_name,
                    'vat_percent': vat_percent,
                })
                quantity = w.quantity

        # Label dimensions mapping
        size_map = {
            '26x16': {'width': '26mm', 'height': '16mm'},
            '38x25': {'width': '38mm', 'height': '25mm'},
            '58x39': {'width': '58mm', 'height': '39mm'},
        }

        return {
            'doc_ids': docids,
            'doc_model': 'easy.purchase.barcode.wizard',
            'docs': wizard,
            'products': products,
            'quantity': quantity,
            'company_name': company_name,
            'label_size': label_size,
            'price_type': price_type,
            'label_dims': size_map.get(label_size, size_map['38x25']),
        }
