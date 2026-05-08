/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { Navbar } from "@point_of_sale/app/components/navbar/navbar";
import { patch } from "@web/core/utils/patch";
import { accountTaxHelpers } from "@account/helpers/account_tax";

const STORAGE_KEY = "pos_total_discount_variants";

function getDiscountVariants() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        // ignore
    }
    return [10, 20, 30, 40, 50];
}

function saveDiscountVariants(variants) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(variants));
    } catch (e) {
        // ignore
    }
}

export class TotalDiscountButton extends Component {
    static template = "pos_total_discount.TotalDiscountButton";
    static props = {};

    setup() {
        this.pos = usePos();
        this.state = useState({
            variants: getDiscountVariants(),
            popup: null,
            // Radio button selections
            discountType: "total",    // 'total' or 'items'
            discountFormat: "percentage", // 'percentage' or 'amount'
            amountValue: "",
            // Track what was last applied for clear
            lastAppliedType: null,
            // Variant management
            addValue: "",
            editValues: [],
            // Notification
            notification: null,
            notificationType: null,
        });
        this._notifTimeout = null;
    }

    get isVisible() {
        return !!this.pos.getOrder();
    }

    get currentDiscount() {
        const order = this.pos.getOrder();
        return order?.globalDiscountPc || 0;
    }

    get discountProductId() {
        return this.pos.config.discount_product_id?.id;
    }

    /**
     * Get regular (non-discount) order lines.
     */
    getRegularLines(order) {
        const dpId = this.discountProductId;
        return order.getOrderlines().filter((l) => !dpId || l.product_id.id !== dpId);
    }

    // --- Popup control ---

    closePopup() {
        this.state.popup = null;
    }

    openDiscountPopup() {
        this.state.amountValue = "";
        this.state.popup = "discount";
    }

    openManagePopup() {
        this.state.popup = "manage";
    }

    openAddPopup() {
        this.state.addValue = "";
        this.state.popup = "add";
    }

    openEditPopup() {
        this.state.editValues = [...this.state.variants];
        this.state.popup = "edit";
    }

    openDeletePopup() {
        this.state.popup = "delete";
    }

    // --- Radio button setters ---

    setDiscountType(type, ev) {
        if (ev) {
            ev.stopPropagation();
            ev.preventDefault();
        }
        this.state.discountType = type;
    }

    setDiscountFormat(format, ev) {
        if (ev) {
            ev.stopPropagation();
            ev.preventDefault();
        }
        this.state.discountFormat = format;
        this.state.amountValue = "";
    }

    /**
     * Self-contained global discount: replicates pos_discount.applyDiscount
     * so this module works even if pos_discount is not installed.
     * Adds one (or more, per tax group) negative discount lines.
     */
    async applyTotalDiscount(percent, order) {
        const product = this.pos.config.discount_product_id;
        if (!product) {
            throw new Error("Discount product not configured on POS");
        }

        const taxKey = (taxIds) =>
            (taxIds || [])
                .map((tax) => tax.id)
                .sort((a, b) => a - b)
                .join("_");

        // Index existing discount lines by tax group
        const dpId = product.id;
        const existingByKey = {};
        for (const l of order.getOrderlines()) {
            if (l.product_id.id === dpId) {
                existingByKey[taxKey(l.tax_ids)] = l;
            }
        }

        const discountableLines = order
            .getOrderlines()
            .filter((l) => l.product_id.id !== dpId);

        if (discountableLines.length === 0) {
            return;
        }

        const baseLines = discountableLines.map((line) =>
            accountTaxHelpers.prepare_base_line_for_taxes_computation(
                line,
                line.prepareBaseLineForTaxesComputationExtraValues()
            )
        );
        accountTaxHelpers.add_tax_details_in_base_lines(baseLines, order.company_id);
        accountTaxHelpers.round_base_lines_tax_details(baseLines, order.company_id);

        const groupingFunction = () => ({
            grouping_key: { product_id: product },
            raw_grouping_key: { product_id: product.id },
        });

        const globalDiscountBaseLines = accountTaxHelpers.prepare_global_discount_lines(
            baseLines,
            order.company_id,
            "percent",
            percent,
            {
                computation_key: "global_discount",
                grouping_function: groupingFunction,
            }
        );

        for (const baseLine of globalDiscountBaseLines) {
            const extra_tax_data =
                accountTaxHelpers.export_base_line_extra_tax_data(baseLine);
            extra_tax_data.discount_percentage = percent;

            const key = taxKey(baseLine.tax_ids);
            const existing = existingByKey[key];
            if (existing) {
                existing.extra_tax_data = extra_tax_data;
                existing.price_unit = baseLine.price_unit;
                delete existingByKey[key];
            } else {
                await this.pos.addLineToOrder(
                    {
                        product_id: baseLine.product_id,
                        price_unit: baseLine.price_unit,
                        qty: baseLine.quantity,
                        tax_ids: [["link", ...baseLine.tax_ids]],
                        product_tmpl_id: baseLine.product_id.product_tmpl_id,
                        extra_tax_data: extra_tax_data,
                    },
                    order,
                    { force: true },
                    false
                );
            }
        }

        // Remove stale discount lines (tax groups that no longer apply)
        for (const stale of Object.values(existingByKey)) {
            stale.delete();
        }
    }

    // --- Helpers ---

    /**
     * Get the line price the user actually sees on screen.
     * Falls back through several properties for cross-version safety.
     */
    getLineDisplayPrice(line) {
        // Try the no-discount variants first (so we compute % off the original price)
        const candidates = [
            line.displayPriceNoDiscount,
            line.priceInclNoDiscount,
            line.priceExclNoDiscount,
            line.displayPrice,
            line.priceIncl,
            line.priceExcl,
        ];
        for (const c of candidates) {
            if (typeof c === "number" && !isNaN(c) && c > 0) {
                return c;
            }
        }
        // Last-ditch fallback: unit price * qty
        const unit = line.price_unit || 0;
        const qty = line.qty || 0;
        return unit * qty;
    }

    /**
     * Apply a percentage discount to a line AND its combo children if any.
     * `asAmount` flags whether the originating user input was a fixed amount
     * (so the orderline UI can render the discount as a currency amount
     * instead of the percentage equivalent).
     */
    setLineDiscount(line, percent, amountValue = null) {
        line.setDiscount(percent);
        if (line.uiState) {
            line.uiState.discountAsAmount = amountValue !== null;
            line.uiState.discountAmountValue = amountValue;
        }
        if (line.combo_line_ids && line.combo_line_ids.length) {
            for (const child of line.combo_line_ids) {
                child.setDiscount(percent);
                if (child.uiState) {
                    child.uiState.discountAsAmount = amountValue !== null;
                    child.uiState.discountAmountValue = amountValue;
                }
            }
        }
    }

    /**
     * Resolve the line the items-discount should target. Capture BEFORE
     * closing the popup, since dismissing the overlay can clear selection.
     */
    getTargetItemLine(order) {
        const sel = order.getSelectedOrderline();
        if (sel && sel.product_id.id !== this.discountProductId) {
            return sel;
        }
        // Fall back to the last regular (non-discount) line
        const regular = this.getRegularLines(order);
        return regular.length ? regular[regular.length - 1] : null;
    }

    // --- Core: Apply discount (percentage preset clicked) ---

    async applyPercentageDiscount(percent) {
        const order = this.pos.getOrder();
        if (!order) {
            this.closePopup();
            return;
        }
        const lines = this.getRegularLines(order);
        if (lines.length === 0) {
            this.closePopup();
            this.showNotification("Add products first!", "warning");
            return;
        }

        if (this.state.discountType === "total") {
            this.closePopup();
            // Total + Percentage: use pos_discount's applyDiscount
            if (!this.pos.config.discount_product_id) {
                this.showNotification("Discount product not configured!", "error");
                return;
            }
            try {
                if (typeof this.pos.applyDiscount === "function") {
                    await this.pos.applyDiscount(percent, order);
                } else {
                    await this.applyTotalDiscount(percent, order);
                }
                this.state.lastAppliedType = "total";
                this.showNotification(`${percent}% total discount applied!`, "success");
            } catch (error) {
                console.error("Total discount error:", error);
                this.showNotification(
                    "Error: " + (error?.message || "could not apply discount"),
                    "error"
                );
            }
        } else {
            // Items + Percentage: capture target line FIRST, then close popup
            const target = this.getTargetItemLine(order);
            if (!target) {
                this.closePopup();
                this.showNotification("Select a product line first!", "warning");
                return;
            }
            this.setLineDiscount(target, percent, null);
            this.closePopup();
            this.state.lastAppliedType = "items";
            this.showNotification(`${percent}% applied to ${target.product_id.display_name}!`, "success");
        }
    }

    // --- Core: Apply discount (amount input) ---

    async applyAmountDiscount() {
        const amount = parseFloat(this.state.amountValue);
        if (isNaN(amount) || amount <= 0) {
            this.showNotification("Enter a valid amount!", "error");
            return;
        }

        const order = this.pos.getOrder();
        if (!order) {
            this.closePopup();
            return;
        }
        const lines = this.getRegularLines(order);
        if (lines.length === 0) {
            this.closePopup();
            this.showNotification("Add products first!", "warning");
            return;
        }

        if (this.state.discountType === "total") {
            this.closePopup();
            // Total + Amount: convert amount to equivalent % off the order subtotal
            // and use pos.applyDiscount (handles taxes, multi-tax groups, etc.)
            if (!this.pos.config.discount_product_id) {
                this.showNotification("Discount product not configured!", "error");
                return;
            }
            try {
                // Use the order's built-in priceIncl (tax-inclusive total).
                // Subtract any existing discount lines so we compute % off the
                // CURRENT subtotal (matching what the user typed against).
                const dpId = this.discountProductId;
                const existingDiscount = order.getOrderlines()
                    .filter((l) => l.product_id.id === dpId)
                    .reduce((s, l) => s + (l.priceIncl || 0), 0);
                let subtotal = (order.priceIncl || 0) - existingDiscount;
                if (subtotal <= 0) {
                    // Fallback: sum regular lines manually
                    subtotal = 0;
                    for (const l of order.getOrderlines()) {
                        if (l.product_id.id === dpId) continue;
                        subtotal += this.getLineDisplayPrice(l);
                    }
                }
                if (!subtotal || subtotal <= 0) {
                    this.showNotification("Order total is zero!", "warning");
                    return;
                }
                if (amount >= subtotal) {
                    this.showNotification("Amount exceeds order total!", "warning");
                    return;
                }
                const percent = (amount / subtotal) * 100;
                if (typeof this.pos.applyDiscount === "function") {
                    await this.pos.applyDiscount(percent, order);
                } else {
                    await this.applyTotalDiscount(percent, order);
                }
                this.state.lastAppliedType = "total";
                this.showNotification(
                    `${amount} off total (${percent.toFixed(2)}%)`,
                    "success"
                );
            } catch (error) {
                console.error("Total amount discount error:", error);
                this.showNotification(
                    "Error: " + (error?.message || "could not apply discount"),
                    "error"
                );
            }
        } else {
            // Items + Amount: capture target BEFORE closing popup
            const target = this.getTargetItemLine(order);
            if (!target) {
                this.closePopup();
                this.showNotification("Select a product line first!", "warning");
                return;
            }
            const linePrice = this.getLineDisplayPrice(target);
            if (!linePrice || linePrice <= 0) {
                this.closePopup();
                this.showNotification("Line price is zero!", "warning");
                return;
            }
            if (amount >= linePrice) {
                this.closePopup();
                this.showNotification("Amount exceeds line price!", "warning");
                return;
            }
            const percent = (amount / linePrice) * 100;
            this.setLineDiscount(target, percent, amount);
            this.closePopup();
            this.state.lastAppliedType = "items";
            this.showNotification(
                `${amount} off ${target.product_id.display_name} (${percent.toFixed(2)}%)`,
                "success"
            );
        }
    }

    // --- Clear: opens a popup to choose which discount(s) to clear ---

    openClearPopup() {
        this.state.popup = "clearChoice";
    }

    clearSelectedLineDiscount() {
        const order = this.pos.getOrder();
        const line = order && order.getSelectedOrderline();
        if (!line) {
            this.closePopup();
            this.showNotification("No line selected", "warning");
            return;
        }
        if (this.discountProductId && line.product_id.id === this.discountProductId) {
            this.closePopup();
            this.showNotification("Selected line is the total-discount line", "warning");
            return;
        }
        if (line.discount > 0) {
            line.setDiscount(0);
            if (line.uiState) {
                line.uiState.discountAsAmount = false;
                line.uiState.discountAmountValue = null;
            }
            if (line.combo_line_ids && line.combo_line_ids.length) {
                for (const child of line.combo_line_ids) {
                    child.setDiscount(0);
                    if (child.uiState) {
                        child.uiState.discountAsAmount = false;
                        child.uiState.discountAmountValue = null;
                    }
                }
            }
            this.showNotification("Selected line discount cleared!", "info");
        } else {
            this.showNotification("Selected line has no discount", "info");
        }
        this.closePopup();
    }

    clearAllLineDiscounts() {
        const order = this.pos.getOrder();
        if (!order) {
            this.closePopup();
            return;
        }
        const dpId = this.discountProductId;
        let cleared = false;
        for (const line of order.getOrderlines()) {
            if (dpId && line.product_id.id === dpId) {
                continue;
            }
            if (line.discount > 0) {
                line.setDiscount(0);
                if (line.uiState) {
                    line.uiState.discountAsAmount = false;
                    line.uiState.discountAmountValue = null;
                }
                cleared = true;
            }
        }
        if (cleared) {
            this.state.lastAppliedType = null;
            this.showNotification("All line discounts cleared!", "info");
        } else {
            this.showNotification("No line discounts to clear", "info");
        }
        this.closePopup();
    }

    clearTotalDiscountOnly() {
        const order = this.pos.getOrder();
        if (!order) {
            this.closePopup();
            return;
        }
        const dpId = this.discountProductId;
        let cleared = false;
        if (dpId) {
            const discountLines = order.getOrderlines().filter(
                (l) => l.product_id.id === dpId
            );
            for (const line of discountLines) {
                line.delete();
                cleared = true;
            }
        }
        if (cleared) {
            this.state.lastAppliedType = null;
            this.showNotification("Total discount cleared!", "info");
        } else {
            this.showNotification("No total discount to clear", "info");
        }
        this.closePopup();
    }

    // --- Variant management ---

    addVariant() {
        const val = parseInt(this.state.addValue);
        if (isNaN(val) || val < 1 || val > 100) {
            this.showNotification("Enter value 1-100", "error");
            return;
        }
        if (this.state.variants.includes(val)) {
            this.showNotification(`${val}% already exists!`, "warning");
            return;
        }
        this.state.variants = [...this.state.variants, val].sort((a, b) => a - b);
        saveDiscountVariants(this.state.variants);
        this.showNotification(`${val}% added!`, "success");
        this.closePopup();
    }

    deleteVariant(percent) {
        this.state.variants = this.state.variants.filter((v) => v !== percent);
        saveDiscountVariants(this.state.variants);
        this.showNotification(`${percent}% deleted!`, "success");
        this.closePopup();
    }

    onEditValueChange(index, ev) {
        this.state.editValues[index] = parseInt(ev.target.value) || 0;
    }

    saveEditedVariants() {
        const valid = this.state.editValues.filter((v) => v >= 1 && v <= 100);
        const unique = [...new Set(valid)].sort((a, b) => a - b);
        this.state.variants = unique;
        saveDiscountVariants(unique);
        this.showNotification("Saved!", "success");
        this.closePopup();
    }

    // --- Notification ---

    showNotification(msg, type) {
        this.state.notification = msg;
        this.state.notificationType = type;
        clearTimeout(this._notifTimeout);
        this._notifTimeout = setTimeout(() => {
            this.state.notification = null;
            this.state.notificationType = null;
        }, 2000);
    }
}

// Register TotalDiscountButton as a sub-component of Navbar
patch(Navbar, {
    components: {
        ...Navbar.components,
        TotalDiscountButton,
    },
});
