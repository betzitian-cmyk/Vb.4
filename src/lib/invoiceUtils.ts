import { ParsedInvoice, ExtractionResult } from "../types";
import { CANADIAN_TAX_RATES, PROVINCE_MAPPING, SYSTEM_INSTRUCTION } from "../constants";

/**
 * Generates an IIF (Intuit Interchange Format) string for QuickBooks
 * Robust implementation following Intuit specs.
 */
export const generateIIF = (parsedInvoice: ParsedInvoice): string => {
  const date = parsedInvoice.date || new Date().toISOString().split("T")[0];
  // Format date to MM/DD/YYYY if it's YYYY-MM-DD
  const formattedDate = date.includes("-") 
    ? (() => {
        const [y, m, d] = date.split("-");
        return `${m}/${d}/${y}`;
      })() 
    : date;

  const vendor = parsedInvoice.vendorName || "Unknown Vendor";
  const total = parsedInvoice.total || 0;
  const docNum = parsedInvoice.invoiceNumber || "";
  const poNum = parsedInvoice.poNumber || "";
  const memo = `applechAI Extraction - ${parsedInvoice.summary?.slice(0, 50) || "Invoice"}`;

  const lines = [
    "!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO",
    "!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO",
    "!ENDTRNS",
    `TRNS\tBILL\t${formattedDate}\tAccounts Payable\t${vendor}\t-${total.toFixed(2)}\t${docNum}\t${memo}`
  ];

  // Expense split lines for items
  parsedInvoice.items.forEach(item => {
    const amount = (item.amount || 0).toFixed(2);
    const itemMemo = `${item.description || "Item"}${item.quantity ? ` (Qty: ${item.quantity})` : ""}`;
    lines.push(`SPL\tBILL\t${formattedDate}\tExpenses\t\t${amount}\t${itemMemo}`);
  });

  // Split line for Tax if applicable
  if ((parsedInvoice.tax || 0) > 0) {
    const taxAcc = parsedInvoice.province === "QC" ? "Sales Tax (QST) Payable" : "Sales Tax (GST/HST) Payable";
    lines.push(`SPL\tBILL\t${formattedDate}\t${taxAcc}\t\t${(parsedInvoice.tax || 0).toFixed(2)}\tTax Amount`);
  }

  lines.push("ENDTRNS");
  return lines.join("\r\n"); // IIF often expects CRLF
};

/**
 * Validates Canadian Tax based on Province and Item Taxability.
 * Uses precision rounding to prevent false positives.
 */
export const calculateTaxDiscrepancy = (invoice: ParsedInvoice) => {
  if (!invoice.province || !CANADIAN_TAX_RATES[invoice.province]) return null;
  
  const provinceRate = CANADIAN_TAX_RATES[invoice.province];
  let expectedTotalTax = 0;
  let taxableSubtotal = 0;
  let zeroRatedSubtotal = 0;
  let exemptSubtotal = 0;

  invoice.items.forEach(item => {
    const amount = item.amount || 0;
    if (item.taxabilityGroup === "Taxable") {
      taxableSubtotal += amount;
      // If item has a specific tax rate, use it, otherwise use provincial default
      expectedTotalTax += amount * (item.taxRate !== undefined ? item.taxRate : provinceRate.total);
    } else if (item.taxabilityGroup === "Zero-Rated") {
      zeroRatedSubtotal += amount;
    } else if (item.taxabilityGroup === "Exempt") {
      exemptSubtotal += amount;
    } else {
      // Fallback for missing group or UNKNOWN
      exemptSubtotal += amount;
    }
  });

  // If items don't have individual amounts but there's a subtotal, use subtotal
  if (taxableSubtotal === 0 && zeroRatedSubtotal === 0 && exemptSubtotal === 0 && (invoice.subtotal || 0) > 0) {
    taxableSubtotal = invoice.subtotal || 0;
    expectedTotalTax = taxableSubtotal * provinceRate.total;
  }

  const actualTax = invoice.tax || 0;
  // Precision check at 2 decimal places
  const expectedRounded = Math.round(expectedTotalTax * 100) / 100;
  const actualRounded = Math.round(actualTax * 100) / 100;
  
  const diff = Math.abs(expectedRounded - actualRounded);
  const isHighRisk = diff > 0.05; // Tightened threshold to $0.05

  return {
    isHighRisk,
    expected: expectedRounded,
    actual: actualRounded,
    difference: diff,
    taxableSubtotal,
    zeroRatedSubtotal,
    exemptSubtotal,
    jurisdiction: provinceRate.name,
    rateType: provinceRate.type,
    rateTotal: provinceRate.total
  };
};

/**
 * Helper to download blobs in browser
 */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Normalizes province metadata using local mappings and tax rates.
 * Cross-references address fields for jurisdictional identification.
 */
export const normalizeProvinceData = (parsed: any): ParsedInvoice => {
  const getProvinceFromText = (text: string): string | null => {
    if (!text) return null;
    const upperText = text.toUpperCase();
    for (const [name, code] of Object.entries(PROVINCE_MAPPING)) {
      if (upperText.includes(name) || upperText.includes(`, ${code}`) || upperText.includes(` ${code} `)) {
        return code;
      }
    }
    return null;
  };

  let identifiedCode = parsed.province ? parsed.province.toUpperCase() : null;
  
  // Mapping fallback
  if (identifiedCode && PROVINCE_MAPPING[identifiedCode]) {
    identifiedCode = PROVINCE_MAPPING[identifiedCode];
  }

  // Address fallback if main field is missing or invalid
  if (!identifiedCode || !CANADIAN_TAX_RATES[identifiedCode]) {
    identifiedCode = getProvinceFromText(parsed.customerAddress) || getProvinceFromText(parsed.vendorAddress);
  }

  if (identifiedCode && CANADIAN_TAX_RATES[identifiedCode]) {
    parsed.taxGroup = CANADIAN_TAX_RATES[identifiedCode].name;
    parsed.province = identifiedCode;
  }
  
  return parsed;
};

/**
 * Orchestrates AI extraction and subsequent data normalization.
 */
export const parseInvoiceWithAI = async (adobeData: ExtractionResult): Promise<ParsedInvoice> => {
  const adobeDataToPass = adobeData.elements
    .filter(el => el.Text || el.Table)
    .map(el => (el.Text ? { type: el.Path, text: el.Text } : { type: "Table", content: "Table data" }))
    .slice(0, 800);

  const response = await fetch("/api/ai/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adobeData: adobeDataToPass,
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: "Extract structured JSON from this Adobe PDF export. Ensure all numbers are primitive floats. Return ONLY JSON."
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "AI parsing failed" }));
    throw new Error(errorData.error || "AI parsing failed");
  }
  
  const parsed = await response.json();
  return normalizeProvinceData(parsed);
};
