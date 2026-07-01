// Generates "POS Order Location.docx" — matches the UI/cover-page design of
// Employee_Device_User_Manual.docx (blue theme, branded cover, header/footer,
// page numbers), with NEXGENN VAN-SALE branding and POS Order Location content.
// Run: node generate_pos_order_location_doc.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Document, Packer, Paragraph, TextRun, PageBreak,
  Header, Footer, PageNumber, AlignmentType, BorderStyle,
  TabStopType, HeadingLevel,
} from "../node_modules/docx/dist/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Palette lifted from the reference manual ----
const BRAND_BLUE = "2D75B6";
const TITLE_NAVY = "1F4D79";
const HEAD_NAVY = "1F3864";
const HDR_BLUE = "2E74B5";
const RULE_BLUE = "5B9BD5";
const GREY = "808080";
const GREY2 = "595959";

const empty = (after = 0) =>
  new Paragraph({ spacing: { after }, children: [] });

const centered = (run, opts = {}) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: opts.spacing || { after: 0 },
    border: opts.border,
    children: [run],
  });

const R = (text, o = {}) =>
  new TextRun({
    text, size: o.size, bold: o.bold, italics: o.italics,
    color: o.color || HEAD_NAVY,
  });

// ---- Body helpers (blue theme, like the reference) ----
const Heading = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, bold: true, color: HEAD_NAVY, size: 30 })],
  });

const Body = (runs) =>
  new Paragraph({
    spacing: { after: 140, line: 288 },
    children: Array.isArray(runs) ? runs : [R(runs, { size: 22 })],
  });

const Bullet = (runs) =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80, line: 276 },
    children: Array.isArray(runs) ? runs : [R(runs, { size: 22 })],
  });

const b = (text, o = {}) => R(text, { size: 22, color: HEAD_NAVY, bold: true, ...o });
const t = (text, o = {}) => R(text, { size: 22, color: HEAD_NAVY, ...o });

// ---- Header (branded, with bottom rule) ----
const header = new Header({
  children: [
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 2, color: RULE_BLUE } },
      tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
      children: [
        new TextRun({ text: "POS Order Location", bold: true, color: HDR_BLUE, size: 18 }),
        new TextRun({ text: "  |  POS Cashier & Manager Guide", color: GREY2, size: 18 }),
        new TextRun({ text: "\t", size: 18 }),
        new TextRun({ text: "NEXGENN VAN-SALE", bold: true, color: HDR_BLUE, size: 18 }),
      ],
    }),
  ],
});

// ---- Footer (Page X of Y, centered, with top rule) ----
const footer = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 6, space: 2, color: RULE_BLUE } },
      children: [
        new TextRun({ text: "Page ", color: GREY2, size: 18 }),
        new TextRun({ children: [PageNumber.CURRENT], bold: true, color: HEAD_NAVY, size: 18 }),
        new TextRun({ text: " of ", color: GREY2, size: 18 }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], bold: true, color: HEAD_NAVY, size: 18 }),
      ],
    }),
  ],
});

const titleBorder = {
  top: { style: BorderStyle.SINGLE, size: 18, space: 8, color: BRAND_BLUE },
  bottom: { style: BorderStyle.SINGLE, size: 18, space: 8, color: BRAND_BLUE },
};

const doc = new Document({
  creator: "Alphalize Technologies",
  title: "POS Order Location",
  description: "POS Order Location — Cashier & Manager Guide",
  styles: { default: { document: { run: { font: "Calibri" } } } },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 864, footer: 720 },
        },
      },
      headers: { default: header },
      footers: { default: footer },
      children: [
        // ============ COVER PAGE ============
        empty(), empty(), empty(),
        centered(R("NEXGENN", { bold: true, color: BRAND_BLUE, size: 40 })),
        centered(R("V A N - S A L E   F O R   O D O O   1 9", { bold: true, color: GREY, size: 22 })),
        empty(),
        centered(R("POS ORDER LOCATION", { bold: true, color: TITLE_NAVY, size: 48 }), { border: titleBorder }),
        empty(),
        centered(R("POS Cashier & Manager Guide", { color: BRAND_BLUE, size: 36 })),
        empty(),
        centered(R("Every sale is automatically tagged with where it was made — GPS position and a readable place name captured the moment payment is validated.", { italics: true, color: GREY, size: 24 })),
        empty(), empty(), empty(),
        centered(R("A simple guide to how each POS order records its location on the receipt and in the back office, what is needed for it to work, and where to view it — no technical setup required.", { italics: true, color: GREY, size: 22 })),
        empty(),
        centered(R("Module Version 19.0.1.0.1   ·   Odoo 19   ·   Point of Sale", { color: GREY, size: 20 })),
        new Paragraph({ children: [new PageBreak()] }),

        // ============ BODY ============
        Heading("About POS Order Location"),
        Body([
          t("Every time a cashier completes a sale in the NEXGENN VAN-SALE app, the app quietly notes "),
          b("where the device was standing"),
          t(" at that moment and attaches it to the order. It records the "),
          b("GPS position"),
          t(" (latitude and longitude) and a "),
          b("readable place name"),
          t(" — for example “Sultan Qaboos Street, Muscat, Oman” — so nobody has to read raw numbers. This lets the owner look back later and know exactly where any order was taken: handy for mobile carts, delivery vans, market stalls, or multiple branches."),
        ]),

        Heading("When the Location Is Captured"),
        Body([
          t("The moment the cashier taps "),
          b("Validate Payment"),
          t(" to finish an order, the app reads the device’s current location and saves it with that order. Nothing extra needs to be done — it happens on its own in the background."),
        ]),
        Body([
          t("The place name is worked out "),
          R("on the device itself", { size: 22, color: HEAD_NAVY, italics: true }),
          t(", so it is free, needs no online map service, and needs no special map key or subscription."),
        ]),

        Heading("What Is Needed for It to Work"),
        Bullet([b("Mobile app: "), t("the sale must be made through the NEXGENN VAN-SALE app, not the desktop back office.")]),
        Bullet([b("Permission: "), t("location access must be allowed for the app on the phone or tablet.")]),
        Bullet([b("GPS on: "), t("the device’s location service should be switched on.")]),
        Body([R("If permission is denied or GPS is off, the order is still saved normally — it simply won’t carry a place tag.", { size: 22, color: GREY2, italics: true })]),

        Heading("Where to See the Location"),
        Bullet([b("On the receipt — "), t("the place name is printed on the in-app receipt for that sale.")]),
        Bullet([b("On the order form — "), t("open any order in the back office and you’ll find a “Location” section showing the place name, latitude and longitude.")]),
        Bullet([b("In the orders list — "), t("a “Location” column sits next to the order date so you can scan many orders at once.")]),

        Heading("The “POS Locations” Menu"),
        Body([
          t("A dedicated menu called "),
          b("POS Locations"),
          t(" is added to the app drawer. Inside it, the "),
          b("Orders with Location"),
          t(" screen lists only the orders that actually carry a place tag, so the view stays clean and isn’t padded with orders made without GPS."),
        ]),

        Heading("Good to Know"),
        Bullet([t("The location fields are "), b("read-only"), t(" in the back office — they are filled by the app at sale time and are not meant to be edited by hand.")]),
        Bullet([t("The place name is only as precise as the device’s GPS at that moment; indoors or in poor signal it may be approximate.")]),
        Bullet([t("Orders created on the desktop (not the mobile app) will have no location, which is expected.")]),

        empty(200),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 6, space: 6, color: RULE_BLUE } },
          spacing: { before: 160 },
          children: [new TextRun({ text: "NEXGENN VAN-SALE   ·   Point of Sale   ·   POS Order Location", color: GREY2, size: 18 })],
        }),
      ],
    },
  ],
});

const out = path.join(__dirname, "POS Order Location.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log("Written:", out, `(${buf.length} bytes)`);
});
