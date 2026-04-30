// --- TYPES FOR INVOICE EXTRACTION ---
interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number | null;
  amount: number;
  tax: number;
  isTaxExempt: boolean;
  taxRate: number | null;
  taxBreakdown: string | null;
}

interface ParsedInvoice {
  invoiceNumber: string | null;
  date: string | null;
  vendorName: string | null;
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  province: string | null;
  taxGroup: string | null;
}

// --- CANADIAN TAX RATES ---
const TAX_RATES: Record<string, any> = {
  "ON": { name: "HST", type: "HST", total: 0.13, federal: 0.05 },
  "BC": { name: "GST + PST", type: "GST/PST", total: 0.12, federal: 0.05 },
  "AB": { name: "GST", type: "GST", total: 0.05, federal: 0.05 },
  "MB": { name: "GST + PST", type: "GST/PST", total: 0.12, federal: 0.05 },
  "SK": { name: "GST + PST", type: "GST/PST", total: 0.11, federal: 0.05 },
  "QC": { name: "GST + QST", type: "GST/QST", total: 0.14975, federal: 0.05 },
  "NB": { name: "HST", type: "HST", total: 0.15, federal: 0.05 },
  "NS": { name: "HST", type: "HST", total: 0.15, federal: 0.05 },
  "PE": { name: "HST", type: "HST", total: 0.15, federal: 0.05 },
  "NL": { name: "HST", type: "HST", total: 0.15, federal: 0.05}
};

const PROVINCE_MAPPING: Record<string, string> = {
  "ONTARIO": "ON", "BRITISH COLUMBIA": "BC", "ALBERTA": "AB",
  "MANITOBA": "MB", "SASKATCHEWAN": "SK", "QUEBEC": "QC",
  "NEW BRUNSWICK": "NB", "NOVA SCOTIA": "NS", "PRINCE EDWARD ISLAND": "PE",
  "NEWFOUNDLAND": "NL"
};

// --- HELPERS ---
const _normalizeProvinceCode = (code: string | null | undefined): string | null => {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  return Object.values(PROVINCE_MAPPING).includes(upper) ? upper : null;
};

const _isLikelyTaxExempt = (description: string): boolean => {
  const exempt = ["medicine", "prescription", "food", "bread", "milk"];
  return exempt.some(e => description.toLowerCase().includes(e));
};

const _isReducedRateItem = (description: string): boolean => {
  const reduced = ["book", "newspaper", "medication"];
  return reduced.some(r => description.toLowerCase().includes(r));
};

const _inferProvinceFromText = (text: string): string | null => {
  if (!text) return null;
  const t = text.toUpperCase();
  for (const [name, code] of Object.entries(PROVINCE_MAPPING)) {
    if (t.includes(name) || t.includes(code)) return code;
  }
  return null;
};

const _extractInvoiceNumber = (text: string): string | null => {
  if (!text) return null;
  const m = text.match(/(?:invoice\s*(?:no\.?|number|#)?\s*[:\-]?\s*)([A-Z0-9\-\/]+)/i);
  return m ? m[1].trim() : null;
};

const _extractDate = (text: string): string | null => {
  if (!text) return null;
  const m = text.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b/);
  return m ? m[1] : null;
};

const _computeTotalsFromLineItems = (lineItems: LineItem[], provinceCode: string | null): [number, number, number, string, string] => {
  let subtotal = 0;
  let taxTotal = 0;

  const prov = provinceCode || "ON";
  const rateInfo = TAX_RATES[prov] || TAX_RATES["ON"];
  const taxGroup = rateInfo.name;

  for (const it of lineItems) {
    const amt = it.amount || 0;
    subtotal += amt;

    if (it.tax && it.tax !== 0) {
      taxTotal += it.tax;
    } else {
      let rate = it.taxRate;
      if (rate === null) {
        rate = rateInfo.total;
        if (rateInfo.type === "HST" && _isReducedRateItem(it.description)) {
          rate = rateInfo.federal;
        }
      }
      if (!_isLikelyTaxExempt(it.description)) {
        taxTotal += amt * rate;
      }
    }
  }

  subtotal = Math.round(subtotal * 100) / 100;
  taxTotal = Math.round(taxTotal * 100) / 100;
  const total = Math.round((subtotal + taxTotal) * 100) / 100;

  return [subtotal, taxTotal, total, prov, taxGroup];
};

const _structuredToParsedInvoice = (structured: any): ParsedInvoice => {
  const text = structured.text || "";
  const lineItems = (structured.lineItems || []) as LineItem[];

  let provHint = structured.provinceHint;
  if (!provHint) {
    provHint = _inferProvinceFromText(text);
  }

  const [subtotal, taxTotal, total, provCode, taxGroup] = _computeTotalsFromLineItems(lineItems, provHint);

  let vendorName: string | null = null;
  for (const ln of text.split("\n")) {
    const trimmed = ln.trim();
    if (trimmed) {
      vendorName = trimmed;
      break;
    }
  }

  return {
    invoiceNumber: _extractInvoiceNumber(text),
    date: _extractDate(text),
    vendorName,
    items: lineItems,
    subtotal,
    tax: taxTotal,
    total,
    province: provCode,
    taxGroup
  };
};

// --- EXTRACTION FUNCTIONS (STUBS FOR NOW) ---
const extractWithDocling = async (filePath: string): Promise<any> => {
  // TODO: Implement Docling extraction
  return null;
};

const extractWithAdobePDFApi = async (filePath: string): Promise<any> => {
  // Adobe is already available via extractPdfData
  try {
    return await extractPdfData(filePath, "application/pdf");
  } catch (e) {
    console.error("[Adobe Extract Error]", e);
    return null;
  }
};

const extractWithLamaParse = async (filePath: string): Promise<any> => {
  // TODO: Implement LamaParse extraction
  return null;
};

const extractWithLamaExtract = async (filePath: string): Promise<any> => {
  // TODO: Implement LamaExtract extraction
  return null;
};

// --- UNIFIED EXTRACTION PIPELINE ---
const extractPdfWithFallbacks = async (filePath: string, provinceHint: string | null = null): Promise<any> => {
  // 1) Docling
  try {
    const doclingResult = await extractWithDocling(filePath);
    if (doclingResult && doclingResult.text) {
      return {
        ...doclingResult,
        provinceHint: _normalizeProvinceCode(provinceHint),
        _provider: "docling"
      };
    }
  } catch (e) {
    console.log("[Docling] Attempting Adobe...");
  }

  // 2) Adobe PDF Extract
  try {
    const adobeResult = await extractWithAdobePDFApi(filePath);
    if (adobeResult) {
      return {
        ...adobeResult,
        provinceHint: _normalizeProvinceCode(provinceHint),
        _provider: "adobe"
      };
    }
  } catch (e) {
    console.log("[Adobe] Attempting LamaParse...");
  }

  // 3) LamaParse
  try {
    const lamaParseResult = await extractWithLamaParse(filePath);
    if (lamaParseResult) {
      return {
        ...lamaParseResult,
        provinceHint: _normalizeProvinceCode(provinceHint),
        _provider: "lamaparse"
      };
    }
  } catch (e) {
    console.log("[LamaParse] Attempting LamaExtract...");
  }

  // 4) LamaExtract
  try {
    const lamaExtractResult = await extractWithLamaExtract(filePath);
    if (lamaExtractResult) {
      return {
        lineItems: lamaExtractResult.lineItems || [],
        text: "",
        objects: [],
        pages: [],
        tables: [],
        provinceHint: _normalizeProvinceCode(provinceHint),
        _provider: "lamaextract"
      };
    }
  } catch (e) {
    console.log("[LamaExtract] All extraction providers failed");
  }

  throw new Error("All extraction providers failed");
};

// --- NEW ENDPOINT: /api/extract-invoice ---
app.post("/api/extract-invoice", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file was uploaded." });

  const filePath = req.file.path;
  const provinceHint = (req.body.province as string) || null;

  try {
    const fileHash = getFileHash(filePath);
    const cacheKey = `${fileHash}_invoice`;
    
    if (extractionCache.has(cacheKey)) {
      return res.json({ ...extractionCache.get(cacheKey), cached: true });
    }

    // Run unified extraction pipeline
    const structured = await extractPdfWithFallbacks(filePath, provinceHint);
    
    // Convert to parsed invoice format
    const parsedInvoice = _structuredToParsedInvoice(structured);
    
    extractionCache.set(cacheKey, parsedInvoice);
    res.json({ ...parsedInvoice, cached: false });

  } catch (error: any) {
    console.error("[Invoice Extraction Error]", error);
    res.status(500).json({ error: error.message || "Failed to extract invoice." });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) console.error(`[Cleanup Error] Failed to delete ${filePath}:`, err);
      });
    }
  }
});
