# HKM Visakhapatnam Book Distribution ERP

Web-based ERP for managing book distribution, warehouse stock movement, activities, sales, returns, and stock reporting.

## Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Google Apps Script
- Database: Google Sheets
- Hosting: Vercel

## Project Structure

```text
frontend/
  index.html
  styles.css
  config.js
  api.js
  app.js
backend/
  appsscript.json
  Code.gs
  Schema.gs
  Database.gs
  Api.gs
vercel.json
```

## Core Stock Rule

Stock is never manually edited. Stock changes only through posted documents and ledger rows:

- ISSUE
- RECEIVE
- SALE
- RETURN
- TRANSFER
- ADJUSTMENT

Reports calculate current stock from `StockLedger`.

