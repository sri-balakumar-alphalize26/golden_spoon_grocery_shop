/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, useRef, useEffect } from "@odoo/owl";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { useService } from "@web/core/utils/hooks";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { formatFloat } from "@web/views/fields/formatters";
import { parseFloat } from "@web/views/fields/parsers";
import { _t } from "@web/core/l10n/translation";

// Fallback pack size when a product has no explicit value (kept in sync with Python).
const PIECES_PER_DOZEN = 12;

/**
 * Editable "On Hand (Dozens)" field. Typing a dozen value that would change the
 * product's current Quantity On Hand pops a confirmation first ("Change On Hand
 * from 100 to 120?"). Cancel reverts the input and leaves the stock untouched;
 * Confirm lets the value through so the server onchange fills Quantity On Hand.
 */
export class DozenOnhandField extends Component {
    static template = "product_dozen_display.DozenOnhandField";
    static props = { ...standardFieldProps };

    setup() {
        this.dialog = useService("dialog");
        this.inputRef = useRef("input");
        // Keep the input in sync with the record value, but never while the user
        // is actively editing it (that would clobber what they are typing).
        useEffect(() => {
            const el = this.inputRef.el;
            if (el && document.activeElement !== el) {
                el.value = this.formattedValue;
            }
        });
    }

    onFocus(ev) {
        // Match Odoo's normal number-field flow: select the whole value on
        // focus so typing replaces it instead of appending.
        ev.target.select();
    }

    get value() {
        return this.props.record.data[this.props.name] || 0;
    }

    get formattedValue() {
        return formatFloat(this.value, { digits: [16, 2] });
    }

    _round(n) {
        return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    }

    async onChange(ev) {
        const record = this.props.record;
        let newDozens;
        try {
            newDozens = parseFloat(ev.target.value || "0");
        } catch {
            // Invalid input -> restore the last good value.
            ev.target.value = this.formattedValue;
            return;
        }

        const pack = record.data.dozen_pack_size || PIECES_PER_DOZEN;
        const oldOnHand = this._round(record.data.qty_available || 0);
        const newOnHand = this._round(newDozens * pack);

        // No real change to the on-hand quantity -> commit silently, no popup.
        if (oldOnHand === newOnHand) {
            await record.update({ [this.props.name]: newDozens, qty_available: newOnHand });
            return;
        }

        this.dialog.add(ConfirmationDialog, {
            title: _t("Change On Hand?"),
            body: _t(
                "This will change the On Hand quantity from %(old)s to %(new)s (%(dozens)s Dozen × %(pack)s).",
                { old: oldOnHand, new: newOnHand, dozens: this._round(newDozens), pack: pack }
            ),
            confirmLabel: _t("Confirm"),
            cancelLabel: _t("Cancel"),
            confirm: async () => {
                // Set qty_available directly so the visible "Quantity On Hand"
                // updates immediately; also set the dozen value so the field and
                // the on-save inverse stay consistent.
                await record.update({ [this.props.name]: newDozens, qty_available: newOnHand });
            },
            cancel: () => {
                // Leave the stock alone and put the field back to its old value.
                if (this.inputRef.el) {
                    this.inputRef.el.value = this.formattedValue;
                }
            },
        });
    }
}

export const dozenOnhandField = {
    component: DozenOnhandField,
    displayName: _t("On Hand (Dozens)"),
    supportedTypes: ["float"],
};

registry.category("fields").add("dozen_onhand", dozenOnhandField);
