/*
 * Generates documents/Golden_Spoon_User_Manual.docx.
 * Run with: node scripts/generate_manual.js
 */

const fs = require("fs");
const path = require("path");
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  HeightRule,
  ShadingType,
  LevelFormat,
  ImageRun,
} = require("docx");

const FONT = "Times New Roman";
const COLOR_HEADING = "2E7D32"; // dark green to match app theme
const COLOR_SUB = "1B5E20";
const COLOR_NOTE = "B71C1C";

// ---------- helpers ----------

function run(text, opts = {}) {
  return new TextRun({ text, font: FONT, ...opts });
}

function heading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 200 },
    children: [
      new TextRun({
        text,
        font: FONT,
        bold: true,
        size: 36, // 18pt
        color: COLOR_HEADING,
      }),
    ],
  });
}

function subheading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 120 },
    children: [
      new TextRun({
        text,
        font: FONT,
        bold: true,
        size: 28, // 14pt
        color: COLOR_SUB,
      }),
    ],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 300 },
    children: [run(text, { size: 24, ...opts })],
  });
}

function label(prefix, value) {
  return new Paragraph({
    spacing: { after: 80, line: 300 },
    children: [
      run(prefix + " ", { bold: true, size: 24 }),
      run(value, { size: 24 }),
    ],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60, line: 280 },
    children: [run(text, { size: 24 })],
  });
}

function numbered(text) {
  return new Paragraph({
    numbering: { reference: "steps", level: 0 },
    spacing: { after: 60, line: 280 },
    children: [run(text, { size: 24 })],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function spacer() {
  return new Paragraph({ children: [run("")] });
}

/** A bordered grey box where the user can paste a screenshot. */
function placeholderBox(moduleName) {
  const greyBorder = {
    style: BorderStyle.SINGLE,
    size: 8,
    color: "BDBDBD",
  };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        height: { value: 4000, rule: HeightRule.ATLEAST }, // ~2.8 inches
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "FAFAFA" },
            borders: {
              top: greyBorder,
              bottom: greyBorder,
              left: greyBorder,
              right: greyBorder,
            },
            margins: { top: 200, bottom: 200, left: 200, right: 200 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 1400 },
                children: [
                  new TextRun({
                    text: `[ Paste picture of ${moduleName} screen here ]`,
                    font: FONT,
                    italics: true,
                    color: "757575",
                    size: 24,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ---------- screenshot embedding ----------

const IMAGES_DIR = path.join(__dirname, "..", "assets_for_manual", "Pics");

const IMAGES = {
  login:        "Screenshot_20260514-110241_Golden Spoon Vegetables.jpg",
  home:         "Screenshot_20260514-110259_Golden Spoon Vegetables.jpg",
  pos:          "Screenshot_20260514-110319_Golden Spoon Vegetables.jpg",
  orders:       "Screenshot_20260514-110328_Golden Spoon Vegetables.jpg",
  salesReport:  "Screenshot_20260514-110342_Golden Spoon Vegetables.jpg",
  stock:        "Screenshot_20260514-110404_Golden Spoon Vegetables.jpg",
  products:     "Screenshot_20260514-110432_Golden Spoon Vegetables.jpg",
  easyPurchase: "Screenshot_20260514-110447_Golden Spoon Vegetables.jpg",
  customers:    "Screenshot_20260514-110457_Golden Spoon Vegetables.jpg",
  idProofs:     "Screenshot_20260514-110501_Golden Spoon Vegetables.jpg",
  expenses:     "Screenshot_20260514-110509_Golden Spoon Vegetables.jpg",
  users:        "Screenshot_20260514-110517_Golden Spoon Vegetables.jpg",
  banners:      "Screenshot_20260514-110527_Golden Spoon Vegetables.jpg",
  privileges:   "Screenshot_20260514-110535_Golden Spoon Vegetables.jpg",
};

// Read width/height from the JPEG SOF marker (no extra dependency).
function getJpegDimensions(buf) {
  let i = 2; // skip SOI (0xFFD8)
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    // SOF markers (excluding DHT 0xC4, JPG 0xC8, DAC 0xCC)
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    const segLen = buf.readUInt16BE(i + 2);
    i += 2 + segLen;
  }
  return null;
}

/** A bordered cell containing the actual screenshot, or the placeholder if missing. */
function imageBox(imageKey, fallbackName) {
  const filename = IMAGES[imageKey];
  if (!filename) return placeholderBox(fallbackName);

  const filePath = path.join(IMAGES_DIR, filename);
  if (!fs.existsSync(filePath)) return placeholderBox(fallbackName);

  const data = fs.readFileSync(filePath);
  const dims = getJpegDimensions(data) || { width: 1080, height: 2400 };

  // Display 4 inches wide; preserve aspect ratio for height.
  const displayWidth = 384; // 4 inches at 96 DPI
  const displayHeight = Math.round(displayWidth * (dims.height / dims.width));

  const greyBorder = {
    style: BorderStyle.SINGLE,
    size: 8,
    color: "BDBDBD",
  };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: {
              top: greyBorder,
              bottom: greyBorder,
              left: greyBorder,
              right: greyBorder,
            },
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data,
                    transformation: { width: displayWidth, height: displayHeight },
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function adminNotice() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 200 },
    children: [
      new TextRun({
        text:
          "Note: This section is for administrators only. If you don't see this option on your home screen, it has been hidden by your admin.",
        font: FONT,
        italics: true,
        size: 22,
        color: COLOR_NOTE,
      }),
    ],
  });
}

/** Build a full module section: heading, placeholder, what/how, steps, tips. */
function moduleSection({
  title,
  picture,
  imageKey,
  whatItDoes,
  howToOpen,
  steps,
  tips,
  admin = false,
}) {
  const out = [heading(title)];
  if (admin) out.push(adminNotice());
  out.push(imageBox(imageKey, picture));
  out.push(spacer());
  out.push(subheading("What it does"));
  out.push(body(whatItDoes));
  out.push(subheading("How to open it"));
  out.push(label("From the Home screen:", howToOpen));
  out.push(subheading("Step by step"));
  steps.forEach((s) => out.push(numbered(s)));
  if (tips && tips.length) {
    out.push(subheading("Tips"));
    tips.forEach((t) => out.push(bullet(t)));
  }
  out.push(pageBreak());
  return out;
}

// ---------- read app version ----------

let appVersion = "1.0.0";
try {
  const appJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "app.json"), "utf8")
  );
  appVersion = appJson.expo?.version ?? appVersion;
} catch (_) {}

// ---------- cover page ----------

const cover = [
  new Paragraph({ spacing: { before: 2400 }, children: [run("")] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: "Golden Spoon Vegetables",
        font: FONT,
        bold: true,
        size: 56,
        color: COLOR_HEADING,
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({ text: "User Manual", font: FONT, size: 40, bold: true }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [
      new TextRun({
        text: "A complete walkthrough — from opening the app to using every feature",
        font: FONT,
        italics: true,
        size: 24,
        color: "555555",
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [run(`App Version ${appVersion}`, { size: 24 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [run(`Issued: ${new Date().toISOString().slice(0, 10)}`, { size: 24 })],
  }),
  pageBreak(),
];

// ---------- table of contents (manual list) ----------

const toc = [
  heading("Table of Contents"),
  ...[
    "1.  Welcome to Golden Spoon Vegetables",
    "2.  Opening the App for the First Time",
    "3.  Logging In",
    "4.  The Home Dashboard",
    "5.  POS (Point of Sale)",
    "6.  Orders",
    "7.  Sales Report",
    "8.  Products",
    "9.  Stock",
    "10. Easy Purchase",
    "11. Customers",
    "12. Customer ID Proofs",
    "13. Expenses",
    "14. Users (Admin Only)",
    "15. App Banners (Admin Only)",
    "16. App Privileges (Admin Only)",
    "17. Logging Out",
  ].map(
    (line) =>
      new Paragraph({
        spacing: { after: 80, line: 300 },
        children: [run(line, { size: 24 })],
      })
  ),
  pageBreak(),
];

// ---------- intro sections (no placeholder) ----------

const welcome = [
  heading("1. Welcome to Golden Spoon Vegetables"),
  body(
    "Golden Spoon Vegetables is a complete grocery shop point-of-sale (POS) and back-office app. It helps your shop run daily sales at the counter, track stock, record purchases from suppliers, manage customers, monitor expenses, and view detailed sales reports — all from a single mobile device."
  ),
  body(
    "This manual is written for everyone who uses the app: cashiers at the till, shop managers reviewing reports, and administrators who set up users and privileges. Read the sections in order if you are new to the app, or jump straight to a specific module using the table of contents."
  ),
  subheading("Who uses this app"),
  bullet("Cashiers — open the register, ring up sales, take payments, print receipts."),
  bullet("Shop managers — check daily sales, review stock, record expenses, manage customers."),
  bullet("Administrators — create users, control which features each user can see, manage promotional banners."),
  pageBreak(),
];

const opening = [
  heading("2. Opening the App for the First Time"),
  placeholderBox("the splash / opening"),
  spacer(),
  subheading("What you will see"),
  body(
    "When you tap the Golden Spoon Vegetables icon on your phone or tablet, a splash screen appears with the app logo on a white background. This usually lasts one to two seconds while the app loads."
  ),
  body(
    "After the splash screen disappears, the app checks whether you are already logged in:"
  ),
  bullet("If this is your first time, or you previously logged out, the Login screen appears."),
  bullet("If you are already logged in from a previous session, you go straight to the Home dashboard."),
  subheading("Permissions on first launch"),
  body(
    "The first time you open the app, your phone may ask you to allow Camera access. Tap Allow — the camera is needed for capturing customer ID-proof photos and (later) for scanning product barcodes. You can change this any time in your phone settings."
  ),
  pageBreak(),
];

// ---------- module sections ----------

const login = moduleSection({
  title: "3. Logging In",
  picture: "the Login",
  imageKey: "login",
  whatItDoes:
    "The Login screen is the first screen you see when you are not signed in. It accepts your username (or email) and password, then unlocks the rest of the app. Your session is remembered, so you only need to log in once per device — until you log out.",
  howToOpen: "Open the app. If you are not signed in, the Login screen appears automatically.",
  steps: [
    "Make sure you can see the Golden Spoon Vegetables logo at the top of the screen.",
    "Tap the first field (Username or Email) and type the username your administrator gave you.",
    "Tap the second field (Password) and type your password. Characters are hidden as you type.",
    "Tap the Login button.",
    "If your details are correct, the Home dashboard opens.",
    "If something is wrong, a small message appears at the bottom (for example, Invalid Details or User does not exist). Check your spelling and try again.",
  ],
  tips: [
    "The username is usually your email address. If you forgot it, ask your administrator.",
    "Both fields are required. The Login button will show an error if either is left empty.",
    "After a successful login, the app remembers you. You will not have to type your password every time you open the app.",
  ],
});

const home = [
  heading("4. The Home Dashboard"),
  imageBox("home", "the Home dashboard"),
  spacer(),
  subheading("What it does"),
  body(
    "The Home dashboard is your starting point after logging in. Every feature in the app is reached by tapping a tile on this screen. Tiles are grouped into sections (such as Sales & POS, Inventory, Contacts, Finance, and Administration) so you can find what you need quickly."
  ),
  subheading("Bottom tabs"),
  body("At the bottom of the screen there are three tabs you can use any time:"),
  bullet("Home — returns to the dashboard from anywhere in the app."),
  bullet("Profile — shows your account details (name, email, role)."),
  bullet("Logout — signs you out and returns to the Login screen."),
  subheading("Top of the screen"),
  body(
    "At the top of the dashboard you may see promotional banners (set by your administrator) that scroll automatically. Below the banners are the feature tiles."
  ),
  subheading("Step by step"),
  numbered("Look at the tiles on screen — each one represents a feature."),
  numbered("Tap a tile (for example, POS) to open that feature."),
  numbered("To come back, tap the back arrow at the top-left, or tap the Home tab at the bottom."),
  subheading("Tips"),
  bullet("If a tile is missing, your administrator may have hidden it for your account. Ask them to enable it through App Privileges."),
  bullet("Pull down on the dashboard to refresh banners and feature visibility."),
  pageBreak(),
];

const pos = [
  heading("5. POS (Point of Sale)"),
  imageBox("pos", "the POS"),
  spacer(),
  subheading("What it does"),
  body(
    "POS is the main daily workflow at the counter. You open a cash register, add products to the cart, take payment from the customer, and print or share a receipt. The app supports Cash, Card, and several UPI / wallet methods (PhonePe, Google Pay, Paytm, BHIM, AmpayPayments, WhatsApp Pay)."
  ),
  subheading("How to open it"),
  label("From the Home screen:", "Home → POS tile."),
  subheading("Step by step — making a sale"),
  numbered("Tap the POS tile on the Home screen."),
  numbered("On the POS Register screen, tap Open Register on the register you want to use."),
  numbered("Enter the opening cash amount (for example, 100) and tap Open."),
  numbered("The Products screen appears. Use the search bar at the top, or tap a category chip to filter."),
  numbered("Tap a product to add it to the cart. A small quantity selector appears — adjust the quantity and confirm."),
  numbered("Repeat for every product the customer is buying."),
  numbered("Tap the cart icon at the top-right (it shows the number of items) to open the Cart Summary."),
  numbered("Review every line. Use the + and − buttons to change a quantity, or the trash icon to remove a line."),
  numbered("Tap Proceed to Payment."),
  numbered("On the Payment screen, tap the customer field if you want to attach the sale to a customer (you can search or add a new one)."),
  numbered("On the Payment screen, find the Apply discount chip. Tap it if the customer is getting a price reduction on this sale; otherwise skip to the next step."),
  numbered("In the Select Discount popup that opens, choose the Discount Type — Total Discount applies the reduction to the whole sale, Items Discount applies it per line — and the Discount Format — Percentage or Amount."),
  numbered("Tap one of the preset values (10%, 20%, 30%, 40%, 50% for percentage; 1, 2, 5, 10, 20 for amount) or type a custom value, then confirm. The chip now shows the active discount, for example 20% off  −5.00, and a Discount line appears in the totals breakdown. Tap the chip again any time to change or remove the discount."),
  numbered("Choose a payment method (Cash, Card, UPI, etc.)."),
  numbered("Type the amount the customer paid. The change due is shown automatically."),
  numbered("If the customer has an ID proof on file, a small preview will appear so you can verify identity."),
  numbered("Tap Create Invoice / Complete Sale."),
  numbered("The receipt preview opens. Tap Print to print on a connected printer, or share it digitally."),
  numbered("You return to the Products screen, ready for the next sale."),
  subheading("Tips"),
  bullet("To pause a sale and come back later, leave the cart and tap back — the order is saved as Draft and can be resumed from the Orders screen."),
  bullet("Closing the register at end of day is done from the same POS Register screen using the Close option on the active session."),
  bullet("If a product is not in the list, ask the manager to add it through the Products module before continuing the sale."),
  pageBreak(),
];

const orders = moduleSection({
  title: "6. Orders",
  picture: "the Orders",
  imageKey: "orders",
  whatItDoes:
    "Orders shows every POS sale, past and present. You can search for a sale by order number, customer name, or date, and filter by status — Draft (not finished), Paid, Posted, Invoiced, or Cancelled. Drafts can be reopened and finished, and any completed order can be reprinted.",
  howToOpen: "Home → Orders tile.",
  steps: [
    "Tap the Orders tile on the Home screen.",
    "The list appears, sorted with the most recent at the top.",
    "Use the filter chips along the top to show only one status, for example Draft or Paid.",
    "Use the search box to find a sale by order number, customer name, or date.",
    "Tap any row to see the full receipt and order details.",
    "If the order has the Draft status, a Resume button appears — tap it to load those items back into the cart and continue the sale.",
    "From the detail view you can print or share the receipt again.",
  ],
  tips: [
    "Status colours: grey = Draft, green = Paid, light green = Posted, blue = Invoiced, red = Cancelled.",
    "Use Pull-to-refresh (drag the list down) to reload the latest data.",
    "Old orders never disappear; the list pages itself as you scroll.",
  ],
});

const salesReport = moduleSection({
  title: "7. Sales Report",
  picture: "the Sales Report",
  imageKey: "salesReport",
  whatItDoes:
    "Sales Report is the analytics dashboard for the shop. It shows total sales, number of orders, average order value, your best-selling products, your best customers, the breakdown of payment methods, and a Profit & Loss view. You can filter by Today, Last 7 Days, Last 30 Days, All Time, or a custom date range. Reports can be exported to PDF or Excel.",
  howToOpen: "Home → Sales Report tile.",
  steps: [
    "Tap the Sales Report tile on the Home screen.",
    "The Overview tab opens, showing today's totals by default.",
    "Tap a period button at the top — Today, 7 Days, 30 Days, All Time — to change the range.",
    "For a custom range, tap Custom, pick a From date, then a To date. The data refreshes automatically.",
    "Swipe left/right or tap the tab headers to switch between Overview, Top Products, Top Customers, Payments, and Profit & Loss.",
    "On the Top Products tab, see which items sold the most by quantity and revenue.",
    "On the Top Customers tab, see which customers spent the most.",
    "On the Payments tab, see the percentage split between Cash, Card, UPI, and other methods.",
    "On the Profit & Loss tab, see net profit after expenses are deducted.",
    "To export, tap the export icon in the top corner and choose PDF or Excel. The file is saved or shared.",
  ],
  tips: [
    "Pull down on the screen to refresh the figures.",
    "The Profit & Loss view uses real expenses recorded in the Expenses module — keep expenses up to date for accurate numbers.",
  ],
});

const products = moduleSection({
  title: "8. Products",
  picture: "the Products",
  imageKey: "products",
  whatItDoes:
    "Products is your full catalogue of items the shop sells. You can browse, search, filter by category, view a product's details (price, image, description), and create new products. Products you create here become available immediately in the POS for selling.",
  howToOpen: "Home → Products tile.",
  steps: [
    "Tap the Products tile on the Home screen.",
    "Browse the tiles, or tap the search bar to find an item by name or SKU.",
    "Tap a category chip at the top to filter by category (for example, Vegetables, Fruits, Dairy).",
    "Tap any product tile to see its details — image, price, stock level, description.",
    "To add a brand-new product, tap the + button in the top-right corner.",
    "Fill in the form: name, category, sales price, description, and (optionally) a product image.",
    "Tap Save. The new product appears in the list and is now available in POS.",
  ],
  tips: [
    "A clear product image makes the POS screen much easier to use during a busy hour.",
    "If you change a product price, the change applies to future sales only — past orders keep their original prices.",
  ],
});

const stock = moduleSection({
  title: "9. Stock",
  picture: "the Stock",
  imageKey: "stock",
  whatItDoes:
    "Stock shows you how many of each item you currently have. The list is colour-coded: green for In Stock, yellow for Low Stock (1–5 units), and red for Out of Stock. You can filter to see only the items that need restocking, and export the whole report to PDF.",
  howToOpen: "Home → Stock tile.",
  steps: [
    "Tap the Stock tile on the Home screen.",
    "By default, all products are listed with their current quantity and a colour indicator.",
    "Tap a filter chip at the top: All, In Stock, Low Stock, or Out of Stock.",
    "Use the search bar to find a specific product.",
    "Tap any product to open the Stock Detail view, which shows breakdowns by warehouse / location.",
    "To export, tap the export icon and choose PDF. The report is saved or shared.",
  ],
  tips: [
    "Use the Low Stock filter at the start of every day to know what to reorder.",
    "Stock levels go up automatically when you record purchases through Easy Purchase, and go down automatically with each POS sale.",
  ],
});

const easyPurchase = moduleSection({
  title: "10. Easy Purchase",
  picture: "the Easy Purchase",
  imageKey: "easyPurchase",
  whatItDoes:
    "Easy Purchase records what you bought from your suppliers. Each purchase has a vendor, a date, line items (product, quantity, unit price), and a payment status. Marking a purchase Done updates your stock automatically and (optionally) prints barcodes for the new items.",
  howToOpen: "Home → Easy Purchase tile.",
  steps: [
    "Tap the Easy Purchase tile on the Home screen.",
    "The list shows existing purchase orders with their reference, vendor, date, status, and amount.",
    "To create a new purchase, tap the + button.",
    "Pick a vendor from the searchable dropdown.",
    "Set the purchase date.",
    "Tap Add Line. Pick a product, enter quantity and unit price.",
    "Repeat Add Line for each item you bought.",
    "Choose a payment method.",
    "Tap Save to keep it as a draft, or Save & Mark as Done to finalise it (this updates stock).",
    "From a saved purchase you can tap Print Barcode to print barcode stickers for the received items.",
  ],
  tips: [
    "Status colours: orange = Draft, green = Done, red = Cancelled.",
    "Payment status — Paid (green), On Credit (blue), Unpaid (orange) — helps you track which suppliers you still owe.",
    "If you receive the same items every week, tap an old purchase, edit the date, and save — much faster than typing it all again.",
  ],
});

const customers = moduleSection({
  title: "11. Customers",
  picture: "the Customers",
  imageKey: "customers",
  whatItDoes:
    "Customers stores everyone who buys from your shop. You can search by name, phone, or email; create new customers; and edit existing ones. Customer records can be linked to POS sales so you can later see who bought what. The form has tabs — Details, Address, Contact Person, Other Details — so all the information stays organised.",
  howToOpen: "Home → Customers tile.",
  steps: [
    "Tap the Customers tile on the Home screen.",
    "Browse the list, or use the search bar to find a customer by name, phone, or email.",
    "Tap a customer card to view full details across the Details, Address, Contact Person, and Other Details tabs.",
    "To edit, open the customer and tap the Edit button.",
    "To create a new customer, tap the + button in the top-right corner.",
    "On the Details tab, enter name, phone, email, and choose the customer type (B2B or B2C).",
    "Tap the Address tab and fill in street, city, state, postal code, and country.",
    "Tap the Contact Person tab if there's a separate person to contact (for B2B customers).",
    "Tap the Other Details tab for payment terms, credit limit, and tax ID.",
    "Tap Save. The new customer appears in the list and can be selected during a POS sale.",
  ],
  tips: [
    "When taking payment in POS, you can tap the customer field to open this same Customers list in select mode — picking a customer attaches them to the sale.",
    "Phone numbers are searched as you type, even partial digits, so adding the phone makes lookup fast at the till.",
  ],
});

const idProofs = moduleSection({
  title: "12. Customer ID Proofs",
  picture: "the Customer ID Proofs",
  imageKey: "idProofs",
  whatItDoes:
    "Customer ID Proofs shows every customer who has uploaded a photo of their identification document. You can view the front and back images full-screen, and upload new ones using the device camera or photo gallery. ID proofs are useful for credit customers, age-restricted sales, and any case where you need to verify identity.",
  howToOpen: "Home → Customer ID Proofs tile.",
  steps: [
    "Tap the Customer ID Proofs tile on the Home screen.",
    "The list shows only customers who have at least one ID photo on file. Each card has a Front / Back badge so you can see what is uploaded.",
    "Search by customer name to narrow down.",
    "Tap a customer to open the ID Proof detail screen — front and back images are shown full-size.",
    "To upload a new ID for a customer, open that customer's detail page (from the Customers list), scroll to the ID Proofs section, and tap Upload Front or Upload Back.",
    "Choose Camera to take a fresh photo, or Gallery to pick an existing image.",
    "Confirm the preview. The image is saved against the customer.",
  ],
  tips: [
    "Make sure the ID is well-lit and all four edges are visible in the photo.",
    "During a POS sale, the Payment screen will show a small ID-proof preview for the selected customer so you can confirm identity at a glance.",
  ],
});

const expenses = moduleSection({
  title: "13. Expenses",
  picture: "the Expenses",
  imageKey: "expenses",
  whatItDoes:
    "Expenses lets staff record costs they have paid on behalf of the shop — meals, transport, accommodation, supplies, and so on. Each expense moves through a status flow: Draft → Submitted → Approved → Paid (or Refused). The dashboard at the top shows how many expenses are waiting at each stage so nothing gets forgotten.",
  howToOpen: "Home → Expenses tile.",
  steps: [
    "Tap the Expenses tile on the Home screen.",
    "The dashboard at the top shows summaries: To Submit, Waiting Approval, Waiting Reimbursement.",
    "Use the filter chips (All, Draft, Submitted, Approved, Paid, Refused) to narrow the list.",
    "To add a new expense, tap the + button.",
    "Type a short description (for example, Lunch with supplier).",
    "Tap the date field and pick the date the expense happened (today by default).",
    "Choose a category from the searchable dropdown.",
    "Enter the total amount.",
    "Choose Payment Mode — Own Account (you paid out of pocket) or Company (paid with company card).",
    "Add any extra notes in the description box.",
    "Tap Save. The expense is saved as Draft.",
    "Open the saved expense and tap Submit for Approval to send it to your manager.",
  ],
  tips: [
    "Status colours: blue = Draft, orange = Submitted, green = Approved, grey = Paid, red = Refused.",
    "If your expense is Refused, open it to see the reason from your manager, edit if appropriate, and resubmit.",
  ],
});

// ---------- admin sections ----------

const users = moduleSection({
  title: "14. Users",
  picture: "the Users",
  imageKey: "users",
  admin: true,
  whatItDoes:
    "Users (admin only) lists everyone who can sign in to the app. The list is split into two groups — Administrators and Users — so you can quickly tell who has full access. From here you can add new users, edit existing ones, and activate or deactivate accounts.",
  howToOpen: "Home → Users tile (only visible to administrators).",
  steps: [
    "Tap the Users tile on the Home screen.",
    "If you are not an administrator, an Access Denied message appears and you are returned to the Home screen after two seconds.",
    "Browse the two sections: ADMINISTRATORS and USERS. Each user card shows avatar, name, email, and active status.",
    "Use the search bar to find a user by name, email, or login.",
    "To create a new user, tap the + button. Fill in name, email, login, password, and choose whether they are an administrator.",
    "To edit, tap any user card, then tap Edit.",
    "To deactivate a user, open them and toggle Active off — they keep their data but cannot log in.",
    "Save your changes.",
  ],
  tips: [
    "Always create a personal account for each member of staff — never share one login. Sales reports rely on knowing who rang up each sale.",
    "Deactivating is safer than deleting; it preserves the historical record of who created which orders.",
  ],
});

const banners = moduleSection({
  title: "15. App Banners",
  picture: "the App Banners",
  imageKey: "banners",
  admin: true,
  whatItDoes:
    "App Banners (admin only) controls the promotional images that scroll across the top of the Home dashboard. Use them for offers, festival greetings, or important shop notices. Banners can be turned on or off with a single switch.",
  howToOpen: "Home → App Banners tile (only visible to administrators).",
  steps: [
    "Tap the App Banners tile on the Home screen.",
    "The list shows existing banners, each with an image, title, and Active/Inactive indicator.",
    "To add a new banner, tap the + button.",
    "Type a banner title (for visual reference; not always shown to users).",
    "Tap the image upload button. Choose Camera, Gallery, or URL.",
    "Camera opens the camera; Gallery opens the photo picker; URL lets you paste a direct link to an image online.",
    "Once the image preview looks right, toggle Active to turn the banner on.",
    "Tap Save. The banner appears on every user's Home dashboard.",
    "To edit or remove a banner later, tap it in the list, change what you need, and save — or use the delete option.",
  ],
  tips: [
    "Wide landscape images look best — roughly 3:1 ratio.",
    "Toggle a banner Inactive instead of deleting if you might want to reuse it later (for example, an Eid greeting next year).",
  ],
});

const privileges = moduleSection({
  title: "16. App Privileges",
  picture: "the App Privileges",
  imageKey: "privileges",
  admin: true,
  whatItDoes:
    "App Privileges (admin only) lets you decide which features each individual user can see. By default new users see everything; here you can hide specific tiles for specific people. For example, you can hide the Sales Report tile for cashiers, or hide the Easy Purchase tile for staff who do not handle suppliers.",
  howToOpen: "Home → App Privileges tile (only visible to administrators).",
  steps: [
    "Tap the App Privileges tile on the Home screen.",
    "Tap the Pick a User card at the top.",
    "Search for the user you want to configure and tap their name.",
    "The full list of features loads, grouped by category (Home tiles, Orders, Products, etc.). Each group can be expanded or collapsed.",
    "Each feature has a toggle switch. ON means visible to that user; OFF means hidden.",
    "Toggle off any features you want to hide for this person. The Save button updates to show how many changes are pending — for example, Save (3).",
    "Use Hide All as a shortcut to disable everything, then turn back on only what you want them to see.",
    "Use Clear All to restore all features to visible.",
    "When you are happy with the selection, tap Save (N). A confirmation message appears.",
    "Repeat for the next user, or close the screen.",
  ],
  tips: [
    "Changes apply the next time the user opens the Home screen — ask them to pull-to-refresh if they don't see the change immediately.",
    "Hiding a feature is not the same as removing data: a user with the POS tile hidden cannot make sales, but their old sales are still in the system.",
  ],
});

const logout = [
  heading("17. Logging Out"),
  placeholderBox("the Logout"),
  spacer(),
  subheading("What it does"),
  body(
    "Logging out signs you out of the app on this device. The next person to open the app will see the Login screen and must sign in with their own credentials. Always log out at the end of a shift if you share a device with other staff."
  ),
  subheading("Step by step"),
  numbered("Tap the Logout tab at the bottom of the screen."),
  numbered("A confirmation modal slides up from the bottom asking 'Are you sure?'"),
  numbered("Tap Yes / Logout to confirm — you are returned to the Login screen."),
  numbered("Tap Cancel if you tapped Logout by mistake."),
  subheading("Tips"),
  bullet("If you have an unfinished POS sale, save it as Draft before you log out — open POS first, leave the cart, and the sale will appear in the Orders list as Draft."),
  bullet("Logging out does not change any data — your sales, orders, expenses and customers all remain in the system."),
];

// ---------- assemble document ----------

const doc = new Document({
  creator: "Golden Spoon Vegetables",
  title: "Golden Spoon Vegetables — User Manual",
  description: "Complete user manual for the Golden Spoon Vegetables POS app.",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 24 },
      },
    },
  },
  numbering: {
    config: [
      {
        reference: "steps",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.START,
            style: {
              paragraph: { indent: { left: 720, hanging: 360 } },
            },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Golden Spoon Vegetables — User Manual    |    Page ",
                  font: FONT,
                  size: 20,
                  color: "888888",
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: FONT,
                  size: 20,
                  color: "888888",
                }),
                new TextRun({
                  text: " of ",
                  font: FONT,
                  size: 20,
                  color: "888888",
                }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  font: FONT,
                  size: 20,
                  color: "888888",
                }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...cover,
        ...toc,
        ...welcome,
        ...opening,
        ...login,
        ...home,
        ...pos,
        ...orders,
        ...salesReport,
        ...products,
        ...stock,
        ...easyPurchase,
        ...customers,
        ...idProofs,
        ...expenses,
        ...users,
        ...banners,
        ...privileges,
        ...logout,
      ],
    },
  ],
});

// ---------- write file ----------

const outPath = path.join(__dirname, "..", "documents", "Golden_Spoon_User_Manual.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log("Wrote", outPath, "(", buf.length, "bytes )");
});
