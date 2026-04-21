export interface AdobeElement {
  Path: string;
  Text?: string;
  Table?: any;
  [key: string]: any;
}

export interface ExtractionResult {
  elements: AdobeElement[];
  cached?: boolean;
  [key: string]: any;
}

export type QueueStatus = "pending" | "processing" | "completed" | "error";

export interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  progress?: number; // 0 to 100
  error?: string;
  rawResult?: ExtractionResult;
  parsedInvoice?: ParsedInvoice;
}

export interface TaxNumbers {
  businessNumber?: string;
  gstHst?: string;
  pst?: string;
  qst?: string;
  rst?: string;
}

export interface TaxBreakdown {
  gst?: number;
  pst?: number;
  hst?: number;
  qst?: number;
  rst?: number;
}

export type TaxabilityGroup = "Taxable" | "Zero-Rated" | "Exempt";

export interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  tax?: number;
  isTaxExempt?: boolean;
  taxabilityGroup?: TaxabilityGroup;
  taxBreakdown?: TaxBreakdown;
  taxRate?: number;
}

export interface ParsedInvoice {
  invoiceNumber?: string;
  poNumber?: string;
  date?: string;
  dueDate?: string;
  vendorName?: string;
  vendorAddress?: string;
  vendorTaxNumbers?: TaxNumbers;
  customerName?: string;
  customerAddress?: string;
  paymentTerms?: string;
  items: LineItem[];
  subtotal?: number;
  zeroRatedSubtotal?: number;
  exemptSubtotal?: number;
  tax?: number;
  taxBreakdown?: TaxBreakdown;
  province?: string;
  taxGroup?: string;
  total?: number;
  currency?: string;
  summary?: string;
  cached?: boolean;
}

export interface TaxRateInfo {
  name: string;
  type: "GST" | "HST" | "GST+PST" | "GST+RST" | "GST+QST";
  federal: number;
  provincial: number;
  total: number;
}
