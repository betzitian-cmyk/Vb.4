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

  const lines = [
    "!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO",
    "!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO\tSALES TAX CODE",
    "!ENDTRNS",
    `TRNS\tBILL\t${formattedDate}\tAccounts Payable\t${vendor}\t-${total.toFixed(2)}\t${docNum}\t${poNum}`
  ];

  let itemsSum = 0;
  // Expense split lines for items
  parsedInvoice.items.forEach(item => {
    const amountVal = item.amount || 0;
    itemsSum += amountVal;
    const amount = amountVal.toFixed(2);
    const itemMemo = item.description || "Item";
    // Sales Tax Code column is left blank
    lines.push(`SPL\tBILL\t${formattedDate}\tExpenses\t\t${amount}\t${itemMemo}\t`);
  });

  // Automatically calculate Sales Tax Payable split if total exceeds sum of line items
  const taxDifference = total - itemsSum;
  if (taxDifference > 0.001) {
    const taxAcc = parsedInvoice.province === "QC" ? "Sales Tax (QST) Payable" : "Sales Tax (GST/HST) Payable";
    lines.push(`SPL\tBILL\t${formattedDate}\t${taxAcc}\t\t${taxDifference.toFixed(2)}\tTax Amount\t`);
  }

  lines.push("ENDTRNS");
  return lines.join("\r\n"); // IIF often expects CRLF
};

/**
 * Detects items that qualify for point-of-sale rebates or reduced rates.
 * Derived from PDF Page 35 (Printed book rebate: effectively 5% GST in HST provinces).
 */
export const isReducedRateItem = (description: string): boolean => {
  const desc = (description || "").toLowerCase();
  
  // Printed Book criteria (PDF Page 35/60)
  // Excludes newspapers/magazines by default, but includes religious scriptures and audiobooks
  const bookKeywords = [
    "printed book", "novel", "textbook", "religious scripture", 
    "bible", "koran", "torah", "audiobook", "spoken reading",
    "livre imprimé", "manuel scolaire", "écriture religieuses",
    "library book", "journal", "computer manual", "reprint of research"
  ];
  const isBook = bookKeywords.some(k => desc.includes(k));
  
  // Specific exclusions for books (PDF Page 35/60)
  const bookExclusions = [
    "newspaper", "magazine", "periodical", "agenda", "calendar", "syllabus", "timetable",
    "revue", "périodique", "calendrier", "horaire", "admissions handbook", "directories", "price list"
  ];
  if (bookExclusions.some(k => desc.includes(k))) return false;
  
  return isBook;
};

/**
 * Advanced keyword-based detection for Canadian tax exemptions.
 * Derived from Accounting Plus, Ryan PDF, and Taxtips.ca guides.
 * Ensures both AI extraction and verification logic align with federal/provincial standards.
 */
export const isLikelyTaxExempt = (description: string): boolean => {
  const desc = (description || "").toLowerCase();
  
  // Taxable Exclusions (Strictly taxable per PDF/Taxtips/CRA rules)
  const strictlyTaxable = [
    "snack", "candy", "soda", "pop", "carbonated", "confection",
    "alcohol", "wine", "beer", "liquor",
    "tobacco", "cigarette", "cigar",
    "prepared food", "prepared beverage", "restaurant", "ordered",
    // CRA GI-022: Single-serving water (< 600ml) is taxable
    "bottled water < 600ml", "single serve water", "eau embouteillée < 600ml",
    "sparkling water", "carbonated water", "eau pétillante", "eau gazéifiée",
    // PDF Page 40: Club memberships
    "golf club", "fitness club", "business club", "membership dues",
    "club de golf", "club de remise en forme", "club d'affaires", "cotisations",
    // PDF Page 33: Exclusive personal use items
    "personal use", "employee gift", "usage personnel", "cadeau employé",
    // PDF Page 21: Licenses to use real property
    "ice time", "classroom rental", "parking fee", "temps de glace", "location de salle", "frais de stationnement",
    // PDF Page 5: Pet feed
    "pet feed", "cat feed", "dog feed", "bird feed", "live fish", "nourriture pour animaux",
    // PDF Page 6: Office maintenance
    "motor vehicle repair", "office equipment maintenance", "photocopier repair", "appliance repair", "sharpening",
    // PDF Page 6: Off-the-shelf software (unless explicitly marked research)
    "off-the-shelf software", "packaged software", "wordperfect", "lotus",
    // PDF Page 3: Lab/office furniture
    "office furniture", "lab furniture", "stationery", "paper & ribbons",
    "meubles de bureau", "fournitures de bureau"
  ];
  if (strictlyTaxable.some(k => desc.includes(k))) return false;

  const exemptKeywords = [
    // Basic Groceries (Human Consumption)
    "bread", "milk", "vegetable", "fruit", "meat", "fish", "cereal", 
    "cheese", "butter", "yogurt", "egg", "flour", "sugar", "coffee", "tea",
    "pain", "lait", "légume", "viande", "poisson", "céréale", "fromage", "beurre", "oeuf", "farine", "sucre", "café",
    "fresh fruit", "raw wool", "honey", "miel",
    // Water (CRA GI-022)
    "bulk water", "municipal water", "tankload of water", "unbottled water", "water refill",
    "eau en vrac", "eau municipale", "remplissage d'eau",
    "bottled water > 600ml", "water multipack", "eau embouteillée > 600ml",
    // Agricultural & Fishing (Zero-Rated)
    "farm equipment", "farm machinery", "tractor", "seed", "fertilizer", "grain", "livestock", "wool",
    "équipement agricole", "tracteur", "semence", "engrais", "bétail", "laine",
    "harvest", "irrigation", "feed for livestock", "hay", "straw",
    // Medical & Drugs (Zero-Rated/Exempt)
    "prescription", "drug", "insulin", "hearing aid", "pacemaker", "eyeglass", 
    "contact lens", "medical device", "medical equipment", "dental device", "dentist", "physician",
    "médicament", "insuline", "appareil auditif", "stimulateur cardiaque", "lunettes", "verres de contact", "dentiste", "médecin",
    "sutures", "bandages", "gauze", "sterile drains", "diagnostic kit", "glucose kit",
    "suture", "pansement", "gaze", "drain stérile",
    // Feminine Hygiene & Diapers (Zero-Rated per Taxtips)
    "tampon", "sanitary napkin", "feminine hygiene", "diaper", "children's diaper",
    "serviette hygiénique", "couche", "couche pour enfants",
    // Services & Financial & Educational (Exempt)
    "daycare", "child care", "childcare", "insurance", "loan", "mortgage", "interest", 
    "tuition", "residential rent", "music lesson", "tutoring", "academic tutoring",
    "ferry", "bridge toll", "tolls", "legal aid", "bottle deposit", "container deposit",
    "garderie", "assurance", "prêt", "hypothèque", "intérêt", "frais de scolarité", "loyer résidentiel", "cours de musique", "tutorat", "péage", "consigne",
    // Specialized University/Research (University PDF Page 3/6)
    "microscope", "centrifuge", "hot plate", "lab oven", "fume hood", "petri dish", "pipet",
    "custom software", "software license", "research equipment maintenance", "veterinary care", "building renovation",
    "licence de logiciel", "logiciel sur mesure"
  ];
  
  return exemptKeywords.some(k => desc.includes(k));
};

/**
 * Validates Canadian Tax based on Province and Item Taxability.
 * Uses precision rounding to prevent false positives and incorporates expanded exemption logic.
 * Accounts for POS rebates (e.g., books at 5% GST in HST zones).
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
    
    if (item.unitPrice === undefined && (item.quantity || 1) > 0) {
      item.unitPrice = amount / (item.quantity || 1);
    }
    
    // Check for exemptions
    const isExempt = item.isTaxExempt === true || isLikelyTaxExempt(item.description);

    if (!isExempt) {
      taxableSubtotal += amount;
      
      // Determine applicable rate
      let itemRate = item.taxRate !== undefined ? item.taxRate : provinceRate.total;
      
      // POS Rebate Logic (PDF Page 35/60):
      // Printed books in HST provinces (ON, NB, NS, PE, NL) are effectively only 5% GST.
      const isHSTProvince = provinceRate.type === "HST";
      if (isHSTProvince && isReducedRateItem(item.description)) {
        itemRate = provinceRate.federal; // Usually 0.05
      }

      expectedTotalTax += amount * itemRate;
    } else {
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
 * Implements heuristics for Place of Supply (POS) rules.
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

  // Address fallback using Place of Supply (POS) priority
  // Priority 1: Customer Address (Standard for Goods & Services)
  // Priority 2: Vendor Address (Fallback or for local-only services)
  if (!identifiedCode || !CANADIAN_TAX_RATES[identifiedCode]) {
    const customerProv = getProvinceFromText(parsed.customerAddress);
    const vendorProv = getProvinceFromText(parsed.vendorAddress);
    
    // Heuristic: If it's a personal service or local retail, the vendor address might be valid
    const isLikelyLocalOnly = parsed.items?.some((item: any) => 
      /haircut|massage|restaurant|dine-in|ordered in person|coiffure|salon|boutique/i.test(item.description || "")
    );

    identifiedCode = (isLikelyLocalOnly ? (vendorProv || customerProv) : (customerProv || vendorProv)) || null;
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
    }),
    credentials: "include" // Ensure session cookies are sent in iframe
  });

  const contentType = response.headers.get("content-type");
  if (!response.ok) {
    if (contentType && contentType.includes("application/json")) {
      const errorData = await response.json().catch(() => ({ error: "AI parsing failed" }));
      throw new Error(errorData.error || "AI parsing failed");
    } else {
      const text = await response.text();
      if (text.includes("Cookie check") || text.includes("redirectToReturnUrl")) {
        throw new Error("Session expired or cookies blocked. Please open this app in a new tab.");
      }
      throw new Error(`Server error (${response.status}) during AI phase.`);
    }
  }
  
  if (contentType && !contentType.includes("application/json")) {
    const text = await response.text();
    if (text.includes("Cookie check") || text.includes("redirectToReturnUrl")) {
      throw new Error("Session expired or cookies blocked. Please open this app in a new tab.");
    }
    throw new Error("Server returned HTML instead of JSON during AI analysis phase.");
  }

  const parsed = await response.json();
  return normalizeProvinceData(parsed);
};
