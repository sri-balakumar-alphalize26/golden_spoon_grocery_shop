// Generates "Product_Dozen_Display_User_Manual.docx" in the Alphalize manual style
// (cover page, auto Table of Contents, numbered sections, NOTE/TIP/IMPORTANT
// callouts, navy-header tables, running "Page X of Y" footer).
// Run:  node "generate_product_dozen_display_doc.mjs"
import {
    Document, Packer, Paragraph, TextRun, HeadingLevel, TableOfContents,
    Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
    Header, Footer, PageNumber, PageBreak, ShadingType, VerticalAlign,
    TabStopType, TabStopPosition, LevelFormat,
} from "../../node_modules/docx/dist/index.mjs";
import { writeFileSync } from "fs";

const NAVY = "1F3864";
const NAVY2 = "2E4C7E";
const GREY = "666666";
const LIGHT = "F2F5FA";
const WHITE = "FFFFFF";

// ---- inline **bold** parser -> TextRun[] ----
function mkRuns(text, base = {}) {
    const out = [];
    text.split("**").forEach((chunk, i) => {
        if (chunk === "") return;
        out.push(new TextRun({ text: chunk, bold: i % 2 === 1, ...base }));
    });
    return out.length ? out : [new TextRun({ text: "", ...base })];
}

function P(text, opts = {}) {
    return new Paragraph({ spacing: { after: 120, line: 276 }, children: mkRuns(text), ...opts });
}
function H1(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_1 }); }
function H2(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_2 }); }
function bullet(text) {
    return new Paragraph({ bullet: { level: 0 }, spacing: { after: 60, line: 276 }, children: mkRuns(text) });
}
function steps(items) {
    // Manual numbering (avoids docx numbering-instance XML issues); each list
    // restarts at 1 because we number by array index.
    return items.map((t, i) => new Paragraph({
        spacing: { after: 60, line: 276 },
        indent: { left: 460, hanging: 260 },
        children: [new TextRun({ text: (i + 1) + ".  ", bold: true }), ...mkRuns(t)],
    }));
}

// ---- callout (single-cell shaded table) ----
const CALLOUT = {
    NOTE: { fill: "E7EEF7", bar: NAVY },
    TIP: { fill: "E9F3E9", bar: "2E7D32" },
    IMPORTANT: { fill: "FCE8E8", bar: "C62828" },
};
function callout(kind, text) {
    const c = CALLOUT[kind];
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: c.fill },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: c.fill },
            right: { style: BorderStyle.SINGLE, size: 2, color: c.fill },
            left: { style: BorderStyle.SINGLE, size: 24, color: c.bar },
            insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
        },
        rows: [new TableRow({
            children: [new TableCell({
                shading: { type: ShadingType.CLEAR, color: "auto", fill: c.fill },
                margins: { top: 100, bottom: 100, left: 160, right: 160 },
                children: [new Paragraph({
                    spacing: { after: 0, line: 264 },
                    children: [new TextRun({ text: kind + "  ", bold: true, color: c.bar }), ...mkRuns(text)],
                })],
            })],
        })],
    });
}

// ---- tables ----
function cell(text, { header = false, w, bold = false } = {}) {
    return new TableCell({
        width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined,
        shading: header ? { type: ShadingType.CLEAR, color: "auto", fill: NAVY } : undefined,
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
            spacing: { after: 0, line: 264 },
            children: mkRuns(text, header ? { color: WHITE, bold: true } : { bold }),
        })],
    });
}
function dataTable(headers, rows, widths) {
    const hdr = new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { header: true, w: widths && widths[i] })),
    });
    const body = rows.map((r, ri) => new TableRow({
        children: r.map((v, i) => new TableCell({
            width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
            shading: ri % 2 ? { type: ShadingType.CLEAR, color: "auto", fill: LIGHT } : undefined,
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ spacing: { after: 0, line: 264 }, children: mkRuns(String(v)) })],
        })),
    }));
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" },
            left: { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" },
            right: { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "D9D9D9" },
            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "D9D9D9" },
        },
        rows: [hdr, ...body],
    });
}
const spacer = () => new Paragraph({ spacing: { after: 60 }, children: [] });

// ---- running header / footer ----
const runHeader = new Header({
    children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" } },
        children: [new TextRun({ text: "Product Dozen Display  |  User Manual", color: GREY, size: 16 })],
    })],
});
const runFooter = new Footer({
    children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" } },
        children: [
            new TextRun({ text: "Alphalize Technologies", color: GREY, size: 16 }),
            new TextRun({ text: "\t", size: 16 }),
            new TextRun({ text: "Page ", color: GREY, size: 16 }),
            new TextRun({ children: [PageNumber.CURRENT], color: GREY, size: 16 }),
            new TextRun({ text: " of ", color: GREY, size: 16 }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], color: GREY, size: 16 }),
        ],
    })],
});

// ================= COVER =================
const cover = [
    new Paragraph({ spacing: { before: 1600, after: 0 }, children: [] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
        children: [new TextRun({ text: "Product Dozen Display", bold: true, size: 60, color: NAVY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 220 },
        children: [new TextRun({ text: "User Manual", size: 36, color: NAVY2 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 },
        children: [new TextRun({ text: "A L P H A L I Z E   T E C H N O L O G I E S", size: 20, color: GREY, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
        children: [new TextRun({ text: "Product Dozen Display", bold: true, size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
        children: [new TextRun({
            text: "An Odoo 19 add-on that lets you view and enter a product's on-hand stock in dozens (with a configurable pack size) as “X Dozen Y Pcs” — on the product form, the products list, and inventory adjustments.",
            size: 20, color: "444444", italics: true })] }),
    dataTable(
        ["Module", "Version", "Platform", "Audience"],
        [["product_dozen_display", "19.0.1.0.0", "Odoo 19", "Inventory / stock managers"]],
        [30, 18, 18, 34],
    ),
    new Paragraph({ children: [new PageBreak()] }),
];

// ================= CONTENTS =================
const toc = [
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "Contents", bold: true, size: 32, color: NAVY })] }),
    new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
    new Paragraph({ children: [new PageBreak()] }),
];

// ================= BODY =================
const body = [
    H1("1. Introduction"),
    P("Product Dozen Display is a small Odoo 19 add-on for shops that buy or sell items in dozens but track them as single pieces. It shows the on-hand quantity broken into full dozens plus the loose remainder (for example, 115 on hand becomes “9 Dozen 7 Pcs”), and it lets a stock manager type the on-hand quantity in dozens instead of pieces."),
    P("The “dozen” size is configurable per product — by default 12, but you can set any pack size (for example 6 or 15). The module never changes how Odoo stores stock; it only adds a friendlier way to read and enter the same Quantity On Hand."),

    H2("1.1 What the module adds"),
    bullet("A per-product **Dozen Display** toggle on the product form that turns the feature on for that product."),
    bullet("A **Pieces per Dozen** setting (default 12) that controls every dozen conversion for the product."),
    bullet("An editable **On Hand (Dozens)** field — type the stock in dozens and Quantity On Hand fills in automatically."),
    bullet("Read-only **On Hand (Dozen + Pcs)** and **On Hand (Pieces)** fields showing the same stock two ways."),
    bullet("A **Counted (Dozens)** column on the inventory-adjustment screen, so physical counts can be entered in dozens."),
    bullet("On install, it activates the built-in **Dozens** unit and enables the Units of Measure feature."),

    H2("1.2 How it works"),
    P("Quantity On Hand stays the single source of truth. The module simply converts between pieces and dozens using the product's **Pieces per Dozen** value:"),
    steps([
        "You tick **Dozen Display** on a storable product and set **Pieces per Dozen** (default 12).",
        "You type a number in **On Hand (Dozens)**. Odoo calculates Quantity On Hand = dozens × pieces-per-dozen.",
        "A confirmation asks you to approve the change before it is applied to the stock figure.",
        "When you save the product, Odoo records the change as a normal inventory adjustment.",
    ]),
    callout("NOTE", "The dozen fields apply to **countable** products — those measured in the Units family (single pieces, dozens, …). Weight- or volume-based products do not show them."),

    H2("1.3 Module summary"),
    dataTable(
        ["Property", "Value"],
        [
            ["Technical name", "product_dozen_display"],
            ["Display name", "Product Dozen Display"],
            ["Version", "19.0.1.0.0"],
            ["Category", "Inventory"],
            ["Author", "Alphalize Technologies"],
            ["License", "LGPL-3"],
            ["Dependencies", "product, stock, uom"],
            ["Type", "Technical add-on (extends the Product and Inventory screens)"],
        ],
        [32, 68],
    ),

    H1("2. Installation"),
    P("Installing the module is a standard Odoo add-on deployment. You need administrator access to the Odoo server and the database."),
    H2("2.1 Prerequisites"),
    bullet("An Odoo 19 instance you can administer."),
    bullet("The **Inventory** app installed (the module depends on product, stock and uom)."),
    bullet("Server access to the add-ons directory, or permission to upload modules through the interface."),
    H2("2.2 Deploy the module files"),
    P("Copy the **product_dozen_display** folder into your Odoo add-ons directory, then restart the Odoo service so the new module is detected."),
    H2("2.3 Install from the Apps menu"),
    steps([
        "Open **Apps**, then click **Update Apps List** (remove the default “Apps” filter if needed).",
        "Search for **Product Dozen Display**.",
        "Click **Install**.",
    ]),
    callout("TIP", "The module is a technical add-on (not an application), so clear the **Apps** filter in the search bar to find it in the list."),
    H2("2.4 Verify the installation"),
    bullet("Go to **Inventory › Configuration › Units of Measure** — the **Dozens** unit (1 Dozen = 12) is present and active."),
    bullet("Open any storable product and enable **Track Inventory** — a **Dozen Display** checkbox appears under Quantity On Hand."),

    H1("3. The Dozen Fields"),
    P("The module adds the following fields. All of them appear only when the product is storable and **Dozen Display** is enabled."),
    dataTable(
        ["Field", "Where", "Editable", "Purpose"],
        [
            ["Dozen Display", "Product form", "Yes (checkbox)", "Turns the dozen feature on for this product."],
            ["Pieces per Dozen", "Product form", "Yes (number)", "How many single pieces make one dozen (default 12)."],
            ["On Hand (Dozens)", "Product form", "Yes (number)", "Type the on-hand quantity in dozens; fills Quantity On Hand."],
            ["On Hand (Dozen + Pcs)", "Product form + list", "No", "Shows on-hand as full dozens plus loose pieces, e.g. “9 Dozen 7 Pcs”."],
            ["On Hand (Pieces)", "Product form", "No", "Shows the on-hand as a total number of single pieces."],
            ["Counted (Dozens)", "Inventory adjustment", "Yes (number)", "Enter a physical count in dozens; fills Counted Quantity in pieces."],
        ],
        [22, 20, 16, 42],
    ),

    H1("4. Using the Module"),
    H2("4.1 Enable Dozen Display on a product"),
    steps([
        "Open the product (**Inventory › Products** or **Sales › Products**).",
        "Make sure **Track Inventory** (“By Quantity”) is ticked — the product must be storable.",
        "Tick the **Dozen Display** checkbox. The dozen fields appear.",
    ]),
    H2("4.2 Set Pieces per Dozen"),
    P("In **Pieces per Dozen**, enter how many single pieces make one dozen for this product. It defaults to **12**, but you can set any value (for example 6 or 15). Every conversion for this product uses it."),
    callout("TIP", "Each product has its own pack size — eggs can be 12 while another item is 6 or 15."),
    H2("4.3 Enter the on-hand quantity in dozens"),
    steps([
        "In **On Hand (Dozens)**, type the quantity in dozens (for example 10).",
        "A **Change On Hand?** confirmation appears — e.g. “This will change the On Hand quantity from 0 to 120.”",
        "Click **Confirm** to apply, or **Cancel** to leave the stock unchanged.",
        "Click **Save**. Odoo records the change as an inventory adjustment.",
    ]),
    callout("NOTE", "The confirmation appears only when your entry actually changes the current Quantity On Hand. Re-typing the same value does not prompt."),
    H2("4.4 Read the on-hand breakdown"),
    P("**On Hand (Dozen + Pcs)** shows the current stock as full dozens plus the loose remainder (for example “9 Dozen 7 Pcs”), and **On Hand (Pieces)** shows the same stock as a total piece count. The “Dozen + Pcs” value also appears as a column on the products list."),
    H2("4.5 Count in dozens during an inventory adjustment"),
    steps([
        "Open the product's **On Hand** / inventory-adjustment screen.",
        "In the **Counted (Dozens)** column, type the counted quantity in dozens.",
        "The **Counted Quantity** column fills in the equivalent number of pieces.",
        "Click **Apply** to post the adjustment.",
    ]),

    H1("5. Troubleshooting"),
    dataTable(
        ["Symptom", "Cause & fix"],
        [
            ["The Dozen Display checkbox is missing.", "The product must be storable (Track Inventory on) and measured in the Units family. Hard-refresh the browser after installing or upgrading."],
            ["The dozen fields do not appear after ticking the checkbox.", "Save is not required, but a stale browser can hide them — do an empty-cache reload (Ctrl+Shift+R)."],
            ["Quantity On Hand shows dozens, not pieces.", "The product's Unit of Measure is “Dozens”. Set it to “Units” if you want Quantity On Hand counted in single pieces."],
            ["The confirmation popup does not show.", "The widget did not load — do an empty-cache reload so the browser fetches the latest assets."],
        ],
        [38, 62],
    ),

    H1("6. Frequently Asked Questions"),
    P("**Does it change how Odoo stores stock?** No. It reads and writes the standard Quantity On Hand; saving records an ordinary inventory adjustment."),
    P("**Can each product have a different dozen size?** Yes. **Pieces per Dozen** is set per product."),
    P("**Does it work in Point of Sale or Sales orders?** It is a back-office inventory display. POS and sales documents are out of scope."),
    P("**What happens if I leave Pieces per Dozen blank?** It falls back to 12."),

    H1("Appendix A: Quick Reference"),
    H2("Where to find things"),
    dataTable(
        ["Item", "Location"],
        [
            ["Dozen fields", "Product form › General Information, under Quantity On Hand"],
            ["Dozens unit", "Inventory › Configuration › Units of Measure"],
            ["Counted (Dozens)", "Product › On Hand / inventory-adjustment list"],
        ],
        [30, 70],
    ),
    H2("At a glance"),
    dataTable(
        ["Action", "Result"],
        [
            ["Tick Dozen Display", "Dozen fields appear for the product"],
            ["Set Pieces per Dozen = 12, type 10 dozens", "Quantity On Hand = 120"],
            ["On hand = 115 pieces (pack 12)", "On Hand (Dozen + Pcs) = “9 Dozen 7 Pcs”"],
        ],
        [46, 54],
    ),
];

const doc = new Document({
    creator: "Alphalize Technologies",
    title: "Product Dozen Display — User Manual",
    description: "User manual for the product_dozen_display Odoo 19 module.",
    features: { updateFields: true },
    styles: {
        // Customize the BUILT-IN heading styles (no duplicate styleIds).
        default: {
            document: { run: { font: "Calibri", size: 21, color: "222222" } },
            heading1: {
                run: { size: 30, bold: true, color: NAVY },
                paragraph: { spacing: { before: 320, after: 140 }, keepNext: true,
                    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D9D9D9" } } },
            },
            heading2: {
                run: { size: 24, bold: true, color: NAVY2 },
                paragraph: { spacing: { before: 220, after: 100 }, keepNext: true },
            },
        },
    },
    sections: [
        { properties: { titlePage: true },
          footers: { default: runFooter, first: runFooter },
          headers: { default: runHeader, first: new Header({ children: [new Paragraph({ children: [] })] }) },
          children: [...cover, ...toc, ...body].flat() },
    ],
});

const out = "Product_Dozen_Display_User_Manual.docx";
const buf = await Packer.toBuffer(doc);
writeFileSync(out, buf);
console.log("WROTE", out, buf.length, "bytes");
