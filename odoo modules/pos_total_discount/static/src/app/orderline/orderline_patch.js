/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { formatCurrency } from "@web/core/currency";

/**
 * Render the discount label for the line:
 *  - if the user originally entered an AMOUNT, display that exact amount
 *    formatted in the POS currency (e.g. "1.000 ع.ر");
 *  - otherwise display the percentage value (e.g. "10%").
 */
patch(Orderline.prototype, {
    getDiscountDisplayLabel() {
        const line = this.line;
        if (!line) {
            return "";
        }
        const amountValue = line.uiState?.discountAmountValue;
        if (line.uiState?.discountAsAmount && amountValue) {
            return formatCurrency(amountValue, line.currency.id);
        }
        return `${line.discount}%`;
    },
});
