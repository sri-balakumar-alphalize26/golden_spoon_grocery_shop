/*
 * In-place patcher: inserts three "Apply discount" numbered steps into the
 * POS section of "Golden Spoon Vegetables.docx", right after the existing
 * "Tap the customer field..." step. Leaves every other byte alone.
 *
 * Run with: node scripts/patch_discount.js
 */

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const DOCX_PATH = path.join(__dirname, "..", "documents", "Golden Spoon Vegetables.docx");
const BAK_PATH = DOCX_PATH + ".bak";

// The exact text of the existing step we anchor to (full text — must be the
// complete <w:t> contents so a single string replace swaps the whole step).
const ANCHOR_TEXT =
  "On the Payment screen, tap the customer field if you want to attach the sale to a customer (you can search or add a new one).";

const NEW_STEPS = [
  "On the Payment screen, find the Apply discount chip. Tap it if the customer is getting a price reduction on this sale; otherwise skip to the next step.",
  "In the Select Discount popup that opens, choose the Discount Type — Total Discount applies the reduction to the whole sale, Items Discount applies it per line — and the Discount Format — Percentage or Amount.",
  "Tap one of the preset values (10%, 20%, 30%, 40%, 50% for percentage; 1, 2, 5, 10, 20 for amount) or type a custom value, then confirm. The chip now shows the active discount, for example 20% off −5.00, and a Discount line appears in the totals breakdown. Tap the chip again any time to change or remove the discount.",
];

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

(async () => {
  if (!fs.existsSync(DOCX_PATH)) {
    console.error("File not found:", DOCX_PATH);
    process.exit(1);
  }

  const original = fs.readFileSync(DOCX_PATH);
  fs.writeFileSync(BAK_PATH, original);
  console.log("Backup saved:", BAK_PATH, "(", original.length, "bytes )");

  const zip = await JSZip.loadAsync(original);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    console.error("word/document.xml not found inside .docx");
    process.exit(1);
  }
  let xml = await docFile.async("string");

  // Find the anchor step's text.
  const anchorIdx = xml.indexOf(ANCHOR_TEXT);
  if (anchorIdx === -1) {
    console.error(
      "Anchor text not found in document.xml. The user may have reworded that step."
    );
    console.error("Anchor was:", ANCHOR_TEXT);
    process.exit(1);
  }
  if (xml.indexOf(ANCHOR_TEXT, anchorIdx + 1) !== -1) {
    console.error("Anchor text found more than once — ambiguous match. Aborting.");
    process.exit(1);
  }

  // Walk backwards to the opening <w:p ...> or <w:p> tag.
  const pOpenIdx = xml.lastIndexOf("<w:p ", anchorIdx);
  const pOpenIdxAlt = xml.lastIndexOf("<w:p>", anchorIdx);
  const blockStart = Math.max(pOpenIdx, pOpenIdxAlt);
  if (blockStart === -1) {
    console.error("Could not find opening <w:p> for the anchor step.");
    process.exit(1);
  }

  // Walk forwards to the matching </w:p>.
  const closeTag = "</w:p>";
  const closeIdx = xml.indexOf(closeTag, anchorIdx);
  if (closeIdx === -1) {
    console.error("Could not find closing </w:p> for the anchor step.");
    process.exit(1);
  }
  const blockEnd = closeIdx + closeTag.length;

  const sourceBlock = xml.substring(blockStart, blockEnd);

  // Sanity: the source block should contain the anchor text exactly once.
  if (sourceBlock.split(ANCHOR_TEXT).length - 1 !== 1) {
    console.error("Source paragraph block did not isolate cleanly. Aborting.");
    process.exit(1);
  }

  // Build cloned blocks, swapping the <w:t>...</w:t> content for each new step.
  // The original <w:t> contains exactly the anchor text (we wrote it in one
  // single TextRun), so a single string replacement does it.
  const clones = NEW_STEPS.map((newText) =>
    sourceBlock.replace(escapeXml(ANCHOR_TEXT), escapeXml(newText))
  );

  // Sanity: each clone must differ from source (replacement actually happened).
  for (let i = 0; i < clones.length; i++) {
    if (clones[i] === sourceBlock) {
      console.error(
        `Replacement #${i + 1} did not change the source block. ` +
          "The <w:t> may not contain the anchor text verbatim."
      );
      process.exit(1);
    }
  }

  const insertion = clones.join("");
  const newXml =
    xml.substring(0, blockEnd) + insertion + xml.substring(blockEnd);

  zip.file("word/document.xml", newXml);

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  fs.writeFileSync(DOCX_PATH, out);

  console.log(
    "Patched. Wrote",
    DOCX_PATH,
    "(",
    out.length,
    "bytes, was",
    original.length,
    ")"
  );
})().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
