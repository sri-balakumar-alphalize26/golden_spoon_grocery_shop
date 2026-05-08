from odoo import models, api


class PosConfig(models.Model):
    _inherit = 'pos.config'

    @api.model
    def _auto_enable_total_discount(self):
        """Auto-enable pos_discount and set discount product on all POS configs."""
        product = self.env.ref(
            'pos_discount.product_product_consumable', raise_if_not_found=False
        )
        if not product:
            return
        configs = self.search([('discount_product_id', '=', False)])
        for config in configs:
            config.write({
                'module_pos_discount': True,
                'discount_product_id': product.id,
            })
        # Also enable on configs that have the product but module flag is off
        configs_flag_off = self.search([
            ('discount_product_id', '!=', False),
            ('module_pos_discount', '=', False),
        ])
        configs_flag_off.write({'module_pos_discount': True})
