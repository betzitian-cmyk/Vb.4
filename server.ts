import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import fs from "fs";
import AdmZip from "adm-zip";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { LRUCache } from "lru-cache";
import {
  ServicePrincipalCredentials,
  PDFServices,
  ExtractElementType,
  ExtractPDFParams,
  ExtractRenditionsElementType,
  ExtractPDFJob,
  ExtractPDFResult,
  CreatePDFJob,
  CreatePDFResult,
  ServiceUsageError,
  MimeType
} from "@adobe/pdfservices-node-sdk";

// --- ESM REPLACEMENTS ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- TYPES ---
interface AdobeExtraction {
  elements: any[];
  [key: string]: any;
}

interface AIParsePayload {
  adobeData?: any[];
  imageData?: {
    mimetype: string;
    data: string;
  };
  systemInstruction: string;
  prompt: string;
}

// --- CONFIGURATION ---
const PORT = 3000;
const uploadDir = path.join(__dirname, "uploads/tmp");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// --- CACHING ---
const extractionCache = new LRUCache<string, AdobeExtraction>({ max: 500 });
const aiParseCache = new LRUCache<string, any>({ max: 1000 });

// --- UTILS ---
const getFileHash = (filePath: string): string => {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

const getPayloadHash = (payload: AIParsePayload): string => {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
};

const streamToBuffer = async (stream: any): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  if (typeof stream.on === "function") {
    return new Promise((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

// --- SERVICES ---

let pdfServicesInstance: PDFServices | null = null;
const getPdfServices = () => {
  if (!pdfServicesInstance) {
    if (!process.env.ADOBE_CLIENT_ID || !process.env.ADOBE_CLIENT_SECRET) {
      throw new Error("Adobe PDF Services credentials not configured");
    }
    const credentials = new ServicePrincipalCredentials({
      clientId: process.env.ADOBE_CLIENT_ID!,
      clientSecret: process.env.ADOBE_CLIENT_SECRET!,
    });
    pdfServicesInstance = new PDFServices({ credentials });
  }
  return pdfServicesInstance;
};

const extractPdfData = async (filePath: string, mimeType: string): Promise<AdobeExtraction> => {
  const pdfServices = getPdfServices();
  
  let inputAsset = await pdfServices.upload({
    readStream: fs.createReadStream(filePath),
    mimeType: mimeType as MimeType,
  });

  // Image to PDF conversion if needed
  if (mimeType.startsWith("image/")) {
    const createJob = new CreatePDFJob({ inputAsset });
    const pollingURL = await pdfServices.submit({ job: createJob });
    const result = await pdfServices.getJobResult({ pollingURL, resultType: CreatePDFResult });
    inputAsset = (result.result as any).asset || (result.result as any).resource;
  }

  // Structural Extraction
  const params = new ExtractPDFParams({ 
    elementsToExtract: [ExtractElementType.TEXT, ExtractElementType.TABLES],
    elementsToExtractRenditions: [ExtractRenditionsElementType.TABLES]
  });
  const extractJob = new ExtractPDFJob({ inputAsset, params });
  const pollingURL = await pdfServices.submit({ job: extractJob });
  const response = await pdfServices.getJobResult({ pollingURL, resultType: ExtractPDFResult });

  const resultAsset = (response.result as any).resource || (response.result as any).asset;
  const streamAsset = await pdfServices.getContent({ asset: resultAsset });
  const zipBuffer = await streamToBuffer(streamAsset.readStream || streamAsset);
  
  const zip = new AdmZip(zipBuffer);
  const jsonEntry = zip.getEntries().find(e => e.entryName === "structuredData.json");
  if (!jsonEntry) throw new Error("Could not find structuredData.json in Adobe result zip");
  
  return JSON.parse(jsonEntry.getData().toString("utf8"));
};

const parseWithAI = async (payload: AIParsePayload) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY environment variable is missing");

  const { adobeData, imageData, systemInstruction, prompt } = payload;
  
  const messages: any[] = [{ role: "system", content: systemInstruction }];
  
  if (adobeData) {
    messages.push({ 
      role: "user", 
      content: `${prompt}\n\n[DOCUMENT_DATA_START]\n${JSON.stringify(adobeData)}\n[DOCUMENT_DATA_END]` 
    });
  } else if (imageData) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${imageData.mimetype};base64,${imageData.data}` } }
      ]
    });
  }

  // OpenRouter implementation following OpenAI-compatible standard
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://ai.studio/build",
      "X-Title": "ApplechAI"
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`OpenRouter API error: ${response.status} ${errorBody.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("The AI service returned an empty response.");

  try {
    return JSON.parse(content);
  } catch (e) {
    // Fallback: Cleaning markdown wrappers if the model ignores the json_object format
    const cleaned = content.replace(/```json\s*([\s\S]*?)\s*```/g, "$1").trim();
    return JSON.parse(cleaned);
  }
};

// --- APP SETUP ---

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // API Routes
  app.get("/api/health", (_, res) => res.json({ status: "ok", uptime: process.uptime() }));

  app.post("/api/extract", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file was uploaded." });

    const filePath = req.file.path;

    try {
      const fileHash = getFileHash(filePath);
      if (extractionCache.has(fileHash)) {
        return res.json({ ...extractionCache.get(fileHash), cached: true });
      }

      const data = await extractPdfData(filePath, req.file.mimetype);
      extractionCache.set(fileHash, data);
      res.json({ ...data, cached: false });
    } catch (error: any) {
      console.error("[Extraction Error]", error);
      const statusCode = error instanceof ServiceUsageError ? 429 : 500;
      res.status(statusCode).json({ error: error.message || "An error occurred during PDF extraction." });
    } finally {
      // Ensure file is deleted to keep container clean
      if (filePath && fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
          if (err) console.error(`[Cleanup Error] Failed to delete ${filePath}:`, err);
        });
      }
    }
  });

  app.post("/api/ai/parse", async (req, res) => {
    const payloadHash = getPayloadHash(req.body);
    if (aiParseCache.has(payloadHash)) {
      return res.json({ ...aiParseCache.get(payloadHash), cached: true });
    }

    try {
      const result = await parseWithAI(req.body);
      aiParseCache.set(payloadHash, result);
      res.json({ ...result, cached: false });
    } catch (error: any) {
      console.error("[AI Parse Error]", error);
      res.status(500).json({ error: error.message || "An error occurred while the AI was analyzing the document." });
    }
  });

  // --- QST VALIDATION API ---
  app.get("/api/validate-qst/:qstNumber", async (req, res) => {
    const { qstNumber } = req.params;
    try {
      const response = await fetch(`https://svcnab2b.revenuquebec.ca/2019/02/ValidationTVQ/${qstNumber}`);
      
      if (response.status === 404) {
        return res.json({ status: "NOT_FOUND", message: "Not a QST registration number" });
      }
      if (response.status === 400) {
        return res.json({ status: "INVALID_FORMAT", message: "Invalid QST number format" });
      }
      if (!response.ok) {
        return res.status(response.status).json({ error: "Revenü Québec service unavailable" });
      }

      const data: any = await response.json();
      const result = data.Resultat;

      if (result) {
        res.json({
          status: result.StatutSousDossierUsager === "R" ? "ACTIVE" : "REVOKED",
          description: result.DescriptionStatut,
          effectiveDate: result.DateStatut,
          legalName: result.NomEntreprise,
          commercialName: result.RaisonSociale
        });
      } else {
        res.status(500).json({ error: "Unexpected response format from Revenü Québec" });
      }
    } catch (error) {
      console.error("QST Validation Error:", error);
      res.status(500).json({ error: "Internal validation failure" });
    }
  });

  // Serve Frontend
  const distPath = path.join(process.cwd(), "dist");
  if (process.env.NODE_ENV === "production" && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (_, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[Global Error Handled]", err);
    res.status(err.status || 500).json({ error: err.message || "An unexpected system error occurred." });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\x1b[32m✔ Server running on http://localhost:${PORT}\x1b[0m`);
  });
}

startServer();
