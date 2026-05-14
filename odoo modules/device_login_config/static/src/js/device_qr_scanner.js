/** @odoo-module **/
/**
 * Device QR Scanner widget for the Device Registry form.
 *
 * Adds a "Scan Device QR" button. When clicked, opens a modal with a live
 * webcam feed. Uses the browser's built-in BarcodeDetector API (Chrome 83+)
 * to scan the QR code displayed on the tablet screen.
 *
 * Expected QR payload: {"device_id": "<uuid>", "device_name": "<Model>"}
 *
 * On success: fills the mac_address and device_name fields in the form.
 */

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useState, useRef, onWillUnmount, xml } from "@odoo/owl";

// ── Inline OWL template ────────────────────────────────────────────────────
const TEMPLATE = xml`
<div class="ng-device-qr-scanner">
    <button
        t-if="!state.scanning"
        class="btn btn-primary"
        t-on-click="openScanner"
        type="button">
        <i class="fa fa-camera me-2"/>  Scan Device QR
    </button>

    <!-- Scanning modal overlay -->
    <div t-if="state.scanning" class="ng-scanner-backdrop" t-on-click.self="closeScanner">
        <div class="ng-scanner-modal">
            <div class="ng-scanner-header">
                <span class="ng-scanner-title">Scan QR from Tablet</span>
                <button class="btn-close" t-on-click="closeScanner" type="button"/>
            </div>
            <div class="ng-scanner-body">
                <p class="ng-scanner-hint">
                    On the tablet: <b>Configure Device</b> → <b>Device Not Registered</b>
                    → <b>Show My QR</b>.<br/>
                    Point your webcam at the QR on the tablet screen.
                </p>
                <div class="ng-video-wrapper">
                    <video t-ref="video" class="ng-video" autoplay playsinline muted/>
                    <div class="ng-scan-frame"/>
                </div>
                <p class="ng-scanner-status" t-att-class="state.statusClass">
                    <t t-esc="state.status"/>
                </p>
            </div>
        </div>
    </div>
</div>`;

// ── Component ───────────────────────────────────────────────────────────────
class DeviceQRScanner extends Component {
    static template = TEMPLATE;
    static props = {
        record: Object,
    };

    setup() {
        this.notification = useService("notification");
        this.videoRef = useRef("video");
        this.stream = null;
        this.detector = null;
        this.scanLoop = null;

        this.state = useState({
            scanning: false,
            status: "Starting camera…",
            statusClass: "",
        });

        onWillUnmount(() => this._stopCamera());
    }

    async openScanner() {
        // Check BarcodeDetector support
        if (!("BarcodeDetector" in window)) {
            this.notification.add(
                "QR scanning requires Chrome or Edge. Please open Odoo in Chrome.",
                { type: "warning", title: "Browser Not Supported" }
            );
            return;
        }

        this.state.scanning = true;
        this.state.status = "Starting camera…";
        this.state.statusClass = "";

        // Wait for DOM to render the video element
        await new Promise((r) => setTimeout(r, 100));

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
            });
            const video = this.videoRef.el;
            if (!video) return;
            video.srcObject = this.stream;
            await video.play();

            this.detector = new BarcodeDetector({ formats: ["qr_code"] });
            this.state.status = "Point camera at the QR on the tablet…";
            this._startScanLoop();
        } catch (err) {
            if (err.name === "NotAllowedError") {
                this.state.status = "Camera permission denied. Allow camera access and try again.";
                this.state.statusClass = "text-danger";
            } else {
                this.state.status = "Could not start camera: " + err.message;
                this.state.statusClass = "text-danger";
            }
        }
    }

    _startScanLoop() {
        const video = this.videoRef.el;
        if (!video || !this.detector) return;

        const scan = async () => {
            if (!this.state.scanning) return;
            try {
                const codes = await this.detector.detect(video);
                if (codes.length > 0) {
                    const raw = codes[0].rawValue;
                    this._handleScan(raw);
                    return; // stop loop
                }
            } catch (_) {}
            this.scanLoop = requestAnimationFrame(scan);
        };
        this.scanLoop = requestAnimationFrame(scan);
    }

    _handleScan(raw) {
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            this.state.status = "Invalid QR — not a device registration code.";
            this.state.statusClass = "text-danger";
            // Resume scanning
            this.scanLoop = requestAnimationFrame(() => this._startScanLoop());
            return;
        }

        if (!parsed.device_id) {
            this.state.status = "Invalid QR — missing device_id field.";
            this.state.statusClass = "text-danger";
            this.scanLoop = requestAnimationFrame(() => this._startScanLoop());
            return;
        }

        // Fill form fields
        this.props.record.update({
            mac_address: parsed.device_id,
            device_name: parsed.device_name || parsed.device_id,
        });

        this.notification.add(
            `Device ID and Name filled from QR scan.`,
            { type: "success", title: "QR Scanned" }
        );

        this.closeScanner();
    }

    closeScanner() {
        this._stopCamera();
        this.state.scanning = false;
    }

    _stopCamera() {
        if (this.scanLoop) {
            cancelAnimationFrame(this.scanLoop);
            this.scanLoop = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop());
            this.stream = null;
        }
    }
}

// ── Register as a form widget ───────────────────────────────────────────────
registry.category("view_widgets").add("device_qr_scanner", {
    component: DeviceQRScanner,
});
