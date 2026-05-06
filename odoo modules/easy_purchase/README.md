# Simple Purchase Module for Odoo 19

## Overview

A simplified purchase entry module designed for small businesses who need quick, no-fuss purchase recording. Instead of Odoo's multi-step workflow (RFQ → PO → Receipt → Bill), this module provides a **single form** that handles everything in one click.

## Features

- **One-Click Purchase**: Create PO, receive stock, and generate vendor bill automatically
- **POS-like Simplicity**: Just select vendor, add products, and confirm
- **Full Integration**: Properly updates inventory and creates accounting entries
- **Auto Taxes**: Picks up product taxes automatically
- **Optional Auto-Post**: Can automatically post the vendor bill
- **Full Traceability**: Links to created PO, receipt, and bill via smart buttons

## How It Works

1. **Create New Purchase**: Go to Simple Purchase → Purchase Entry → Create
2. **Fill the Form**:
   - Select Vendor
   - Set Date
   - Add Products (quantity, price auto-fills from product)
   - Add vendor reference (optional)
3. **Click "Confirm Purchase"**: That's it! The system will:
   - Create a Purchase Order
   - Confirm the PO
   - Validate the stock receipt (items added to inventory)
   - Create the Vendor Bill

## Installation

1. Copy the `simple_purchase` folder to your Odoo addons directory
2. Update Apps List in Odoo
3. Search for "Simple Purchase" and install

## Dependencies

- Purchase (`purchase`)
- Inventory (`stock`)
- Accounting (`account`)

## Configuration

- **Auto-Post Bill**: Check this option if you want bills to be automatically posted
- **Warehouse**: Select the warehouse for receiving goods

## Menu Access

- Standalone: **Simple Purchase** app in main menu
- Also available under: **Purchase → Quick Purchase**

## Security

- Purchase Users can create/read/write
- Purchase Managers have full access including delete

## Technical Details

### Models
- `simple.purchase`: Main purchase entry
- `simple.purchase.line`: Purchase line items

### Flow
```
Simple Purchase (Draft)
        ↓ [Confirm]
Purchase Order (Created & Confirmed)
        ↓
Stock Picking (Auto-validated)
        ↓
Vendor Bill (Created, optionally posted)
        ↓
Simple Purchase (Done)
```

## License

LGPL-3

## Author

Alphalize Technologies
