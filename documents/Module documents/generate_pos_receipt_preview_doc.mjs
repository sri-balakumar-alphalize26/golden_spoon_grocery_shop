// Generates "POS Receipt Preview.docx" — same UI/cover template as
// "POS Order Location.docx" (blue theme, branded cover, header/footer, page
// numbers), with NEXGENN VAN-SALE branding and POS Receipt Preview content.
// Run: node generate_pos_receipt_preview_doc.mjs
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

const Num = (runs) =>
  new Paragraph({
    numbering: { reference: "steps", level: 0 },
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
        new TextRun({ text: "POS Receipt Preview", bold: true, color: HDR_BLUE, size: 18 }),
        new TextRun({ text: "  |  Backend User Guide", color: GREY2, size: 18 }),
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
  title: "POS Receipt Preview",
  description: "POS Receipt Preview — Backend User Guide",
  styles: { default: { document: { run: { font: "Calibri" } } } },
  numbering: {
    config: [
      {
        reference: "steps",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 480, hanging: 260 } } },
          },
        ],
      },
    ],
  },
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
        centered(R("POS RECEIPT PREVIEW", { bold: true, color: TITLE_NAVY, size: 48 }), { border: titleBorder }),
        empty(),
        centered(R("Backend User Guide", { color: BRAND_BLUE, size: 36 })),
        empty(),
        centered(R("See exactly how a POS order’s receipt will look — at any paper size — right inside Odoo, matching the app receipt down to the signatures.", { italics: true, color: GREY, size: 24 })),
        empty(), empty(), empty(),
        centered(R("A simple guide to previewing a POS receipt from the back office: opening it, choosing the paper size, what the receipt shows, and how to print or download it — no technical setup required.", { italics: true, color: GREY, size: 22 })),
        empty(),
        centered(R("Module Version 19.0.1.0.0   ·   Odoo 19   ·   Point of Sale", { color: GREY, size: 20 })),
        new Paragraph({ children: [new PageBreak()] }),

        // ============ BODY ============
        Heading("About POS Receipt Preview"),
        Body([
          t("POS Receipt Preview lets you look at a sale’s receipt from the Odoo back office, without needing the phone or a printer to hand. It adds a "),
          b("Preview Receipt"),
          t(" button to the order screen that opens the receipt exactly as the NEXGENN VAN-SALE app prints it — the same bilingual layout, items, totals, payment details and signatures. It’s handy for checking a receipt, reprinting one for a customer, or saving a copy as a PDF."),
        ]),
        Body([
          R("Nothing new is stored — the preview simply reads the order’s existing details, so what you see always matches the real sale.", { size: 22, color: GREY2, italics: true }),
        ]),

        Heading("How to Preview a Receipt"),
        Num([b("Open an order — "), t("go to Point of Sale → Orders → Orders and click the sale you want.")]),
        Num([b("Click “Preview Receipt” — "), t("the button sits at the top of the order screen (with an eye icon).")]),
        Num([b("Choose a paper size — "), t("a small popup appears; pick the size you want and click "), b("Preview"), t(".")]),
        Num([b("View, print or download — "), t("the receipt opens on screen; use the toolbar to print or download it as a PDF.")]),

        Heading("Choosing the Paper Size"),
        Body([
          t("The popup offers the "),
          b("same six sizes the app does"),
          t(", so the preview looks just like the printed slip. The default is 3.5 inch (80 mm), the common receipt-printer width:"),
        ]),
        Bullet([b("2 inch "), t("(50 mm) — small thermal printer")]),
        Bullet([b("3 inch "), t("(76 mm)")]),
        Bullet([b("3.5 inch "), t("(80 mm) — default")]),
        Bullet([b("4 inch "), t("(100 mm)")]),
        Bullet([b("A5 "), t("(148 mm)")]),
        Bullet([b("A4 "), t("(210 mm) — full page")]),

        Heading("What the Receipt Shows"),
        Body("The preview reproduces the app receipt, top to bottom:"),
        Bullet([b("Shop letterhead — "), t("company name, address, phone and email.")]),
        Bullet([b("Order details — "), t("customer, cashier, date and receipt number.")]),
        Bullet([b("Items table — "), t("each product with quantity, unit price, discount and line total (bilingual English / Arabic headings).")]),
        Bullet([b("Totals — "), t("subtotal, discount and tax (shown only when they apply), and the grand total.")]),
        Bullet([b("Payment details — "), t("each payment method and amount, split payments if any, and change due.")]),
        Bullet([b("Signatures — "), t("the customer and cashier signatures captured at sale time, when present.")]),

        Heading("Printing & Downloading"),
        Body([
          t("Once the receipt is on screen, the report toolbar’s "),
          b("Print"),
          t(" / "),
          b("Download"),
          t(" produces a PDF the normal Odoo way. The file is auto-named after the order (for example “Receipt - Shop-000004”), and short receipts are laid out to fit neatly on a single page."),
        ]),

        Heading("Good to Know"),
        Bullet([t("The preview is "), b("view-only"), t(" — it never changes the order; it just shows the receipt.")]),
        Bullet([t("Signatures appear only if they were captured for that sale; otherwise their space is simply left blank.")]),
        Bullet([t("The receipt reads right-to-left with English / Arabic labels, matching the app’s bilingual slip.")]),

        empty(200),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 6, space: 6, color: RULE_BLUE } },
          spacing: { before: 160 },
          children: [new TextRun({ text: "NEXGENN VAN-SALE   ·   Point of Sale   ·   POS Receipt Preview", color: GREY2, size: 18 })],
        }),
      ],
    },
  ],
});

const out = path.join(__dirname, "POS Receipt Preview.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log("Written:", out, `(${buf.length} bytes)`);
});
