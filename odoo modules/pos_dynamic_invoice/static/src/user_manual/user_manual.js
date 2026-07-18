/** @odoo-module **/

// In-app viewer for the User Manual PDF. Opens the PDF (served by the
// /pos_dynamic_invoice/user_manual controller) inside an iframe, with an explicit
// Download button in the toolbar. Registered as a client action opened from the
// "Invoice Settings ▸ User Manual" menu.
import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";

export class UserManual extends Component {
    static template = "pos_dynamic_invoice.UserManual";
    static props = ["*"];

    setup() {
        this.pdfUrl = "/pos_dynamic_invoice/user_manual";
        this.downloadUrl = "/pos_dynamic_invoice/user_manual?download=1";
    }

    close() {
        window.history.back();
    }
}

registry.category("actions").add("pos_invoice_user_manual", UserManual);
