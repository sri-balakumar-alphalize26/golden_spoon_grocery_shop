/** @odoo-module **/
/**
 * Device Registry — Auto-save + Auto-refresh
 *
 * 1. Auto-saves a new device.registry record immediately when "New" is clicked
 *    so the QR code (which needs rec.id) appears without the admin clicking Save.
 *
 * 2. Once the record is saved and showing Pre-Registered, polls every 3 seconds.
 *    When the app scans the QR and the record becomes Active, the form reloads
 *    automatically so Device Name and Device ID appear without a manual page refresh.
 */

import { patch } from "@web/core/utils/patch";
import { FormController } from "@web/views/form/form_controller";
import { useService } from "@web/core/utils/hooks";
import { onMounted, onWillUnmount } from "@odoo/owl";

patch(FormController.prototype, {
    setup() {
        super.setup();

        // Only activate for device.registry model
        if (this.props.resModel !== "device.registry") return;

        this.orm = useService("orm");
        this._pollTimer = null;

        onMounted(async () => {
            // ── Step 1: Auto-save new records ──
            if (this.model.root.isNew) {
                try {
                    await this.model.root.save({ stayInEdition: false });
                } catch (_) {
                    // ignore — user can save manually
                }
            }

            // ── Step 2: Start polling if record is pre_registered ──
            this._startPollingIfNeeded();
        });

        onWillUnmount(() => {
            this._stopPolling();
        });
    },

    _startPollingIfNeeded() {
        const rec = this.model.root;
        if (!rec || rec.isNew) return;

        const status = rec.data && rec.data.status;
        if (status === "pre_registered") {
            this._pollTimer = setInterval(() => this._checkForScan(), 3000);
        }
    },

    async _checkForScan() {
        try {
            const recId = this.model.root.resId;
            if (!recId) return;

            const result = await this.orm.read(
                "device.registry",
                [recId],
                ["status", "device_name", "mac_address"]
            );

            if (result && result[0] && result[0].status === "active") {
                // App has scanned — stop polling and reload form to show filled fields
                this._stopPolling();
                await this.model.root.load();
            }
        } catch (_) {
            // ignore network errors during poll
        }
    },

    _stopPolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    },
});
