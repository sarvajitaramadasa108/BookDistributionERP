const ERP_SCHEMA = {
  Settings: ["Key", "Value", "Updated At", "Updated By"],
  Books: ["ERP Code", "Book Name", "Language", "Book Type", "Purchase Price", "Sale Price", "Active", "Created At", "Updated At"],
  Warehouses: ["Warehouse ID", "Warehouse Name", "Type", "SPOC", "Mobile", "Active", "Created At", "Updated At"],
  Activities: ["Activity ID", "Name", "Type", "Start Date", "End Date", "Warehouse ID", "SPOC", "Status", "Created At", "Updated At"],
  Volunteers: ["Volunteer ID", "Name", "Mobile", "Default Warehouse ID", "Active", "Created At", "Updated At"],
  Documents: ["Document ID", "Document Type", "Document Date", "From Warehouse ID", "To Warehouse ID", "Activity ID", "Volunteer ID", "Status", "Notes", "Created At", "Created By", "Updated At"],
  DocumentLines: ["Line ID", "Document ID", "Book ID", "Quantity", "Rate", "Amount", "Line Notes"],
  StockLedger: ["Ledger ID", "Document ID", "Document Line ID", "Ledger Date", "Warehouse ID", "Activity ID", "Book ID", "Movement Type", "Quantity In", "Quantity Out", "Rate", "Amount", "Created At"],
  Users: ["User ID", "Name", "Email", "Role", "Active", "Created At", "Updated At"],
  AuditLog: ["Log ID", "Timestamp", "User", "Action", "Entity", "Entity ID", "Details"]
};

const ERP_DOCUMENT_TYPES = ["ISSUE", "RECEIVE", "SALE", "RETURN", "TRANSFER", "ADJUSTMENT"];

