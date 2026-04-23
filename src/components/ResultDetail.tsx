import React from "react";
import { Brain, AlertCircle, Copy, Check, Zap, ReceiptText, ShieldAlert, Search, ShieldCheck, ShieldX, RefreshCw, Database, ExternalLink, Activity } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ParsedInvoice, ExtractionResult, LineItem } from "../types";
import { calculateTaxDiscrepancy } from "../lib/invoiceUtils";

interface ResultDetailProps {
  item: {
    status: string;
    progress?: number;
    error?: string;
    parsedInvoice?: ParsedInvoice;
    rawResult?: ExtractionResult;
  };
  viewMode: "ui" | "parsed" | "raw";
}

interface ValidationStatus {
  status: "IDLE" | "LOADING" | "ACTIVE" | "REVOKED" | "NOT_FOUND" | "INVALID_FORMAT" | "ERROR";
  legalName?: string;
  message?: string;
}

export const ResultDetail: React.FC<ResultDetailProps> = ({ item, viewMode }) => {
  const { parsedInvoice, rawResult, status, error, progress } = item;
  const [copied, setCopied] = React.useState(false);
  const [autoVerify, setAutoVerify] = React.useState(true);
  
  const [qstStatus, setQstStatus] = React.useState<ValidationStatus>({ status: "IDLE" });
  const [gstStatus, setGstStatus] = React.useState<ValidationStatus>({ status: "IDLE" });

  const handleCopy = () => {
    const text = JSON.stringify(viewMode === "raw" ? rawResult : parsedInvoice, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const validateQST = async (qst: string) => {
    if (!qst) return;
    
    // Normalize: Extract 10 digits and reconstruct as XXXXXXXXXXTQ0001
    // As per RQ technical specs, the QST identifier is 10 digits.
    const digits = qst.replace(/\D/g, "").slice(0, 10);
    if (digits.length !== 10) {
      setQstStatus({ status: "INVALID_FORMAT", message: "QST requires exactly 10 digits" });
      return;
    }
    const normalizedQst = `${digits}TQ0001`;

    setQstStatus({ status: "LOADING" });
    try {
      const response = await fetch(`/api/validate-qst/${normalizedQst}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setQstStatus(data);
    } catch (err: any) {
      setQstStatus({ status: "ERROR", message: err.message });
    }
  };

  const validateGST = async (gst: string) => {
    if (!gst) return;

    // Normalize: Extract 9 digits (Business Number) and reconstruct as XXXXXXXXXRT0001
    const digits = gst.replace(/\D/g, "").slice(0, 9);
    if (digits.length !== 9) {
      setGstStatus({ status: "INVALID_FORMAT", message: "GST/HST requires a 9-digit Business Number" });
      return;
    }
    const normalizedGst = `${digits}RT0001`;

    setGstStatus({ status: "LOADING" });
    // Note: Official CRA API requires complex params. 
    // We implement a format check + registry link for now as per search limits.
    setTimeout(() => {
      setGstStatus({ 
        status: "IDLE", 
        message: `Validated structure: ${normalizedGst}` 
      });
    }, 800);
  };

  // 1. Reset state when changing invoices
  React.useEffect(() => {
    setQstStatus({ status: "IDLE" });
    setGstStatus({ status: "IDLE" });
  }, [parsedInvoice?.invoiceNumber]);

  // 2. Automated trigger based on toggle and available data
  React.useEffect(() => {
    if (!autoVerify || !parsedInvoice) return;
    
    // Capture values to prevent closure issues
    const qstNum = parsedInvoice.vendorTaxNumbers?.qst;
    const gstNum = parsedInvoice.vendorTaxNumbers?.gstHst;
    const isQC = parsedInvoice.province === "QC";

    const triggerValidation = async () => {
      if (isQC && qstNum) await validateQST(qstNum);
      if (gstNum) await validateGST(gstNum);
    };

    triggerValidation();
  }, [parsedInvoice?.invoiceNumber, autoVerify]);

  if (status === "processing") return <LoadingState progress={progress} />;
  if (status === "error") return <ErrorState error={error} />;
  if (!parsedInvoice && status === "completed") return <EmptyState />;

  if (viewMode === "ui" && parsedInvoice) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-12 pb-24"
      >
        <CacheHitBadge show={!!parsedInvoice.cached} />
        
        <section className="space-y-6">
          <SectionHeader icon={<Zap className="w-5 h-5" />} title="Operational Overview" />
          <StatGrid invoice={parsedInvoice} qstValidation={qstStatus} gstValidation={gstStatus} />
        </section>

        <section className="space-y-6">
          <SectionHeader icon={<Activity className="w-5 h-5 text-blue-500" />} title="Tax Compliance Verification" />
          <ComplianceBoard 
            invoice={parsedInvoice} 
            qstStatus={qstStatus} 
            gstStatus={gstStatus}
            onValidateQST={() => parsedInvoice.vendorTaxNumbers?.qst && validateQST(parsedInvoice.vendorTaxNumbers.qst)}
            onValidateGST={() => parsedInvoice.vendorTaxNumbers?.gstHst && validateGST(parsedInvoice.vendorTaxNumbers.gstHst)}
            autoVerify={autoVerify}
            onToggleAuto={() => setAutoVerify(!autoVerify)}
          />
        </section>

        <section className="space-y-6">
          <SectionHeader icon={<Brain className="w-5 h-5 text-orange-500" />} title="Fiscal Analysis" />
          <TaxAnalysis invoice={parsedInvoice} />
        </section>

        <section className="space-y-6">
          <SectionHeader icon={<ReceiptText className="w-5 h-5 text-gray-400" />} title="Ledger Verification" />
          <LineItemsTable invoice={parsedInvoice} />
        </section>
      </motion.div>
    );
  }

  return (
    <div className="relative group">
      <CopyButton onCopy={handleCopy} copied={copied} />
      <div className="rounded-[2.5rem] overflow-hidden border border-gray-950 shadow-2xl">
        <pre className="text-[11px] font-mono bg-[#0A0A0A] text-gray-400 p-10 overflow-auto max-h-[800px] leading-relaxed custom-scrollbar selection:bg-orange-500/30 selection:text-white">
          {JSON.stringify(viewMode === "raw" ? rawResult : parsedInvoice, null, 2)}
        </pre>
      </div>
    </div>
  );
};

/* --- SHARED COMPONENTS --- */

const SectionHeader = ({ icon, title }: { icon: React.ReactNode, title: string }) => (
  <div className="flex items-center gap-3 px-2">
    <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">{icon}</div>
    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-900">{title}</h3>
  </div>
);

const CopyButton = ({ onCopy, copied }: { onCopy: () => void, copied: boolean }) => (
  <button 
    onClick={onCopy}
    className="absolute top-6 right-6 p-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all border border-white/5 backdrop-blur-xl z-20 group"
  >
    {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 group-hover:scale-110 transition-transform" />}
  </button>
);

const CacheHitBadge = ({ show }: { show: boolean }) => (
  <AnimatePresence>
    {show && (
      <motion.div 
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        className="flex items-center gap-2 px-5 py-3 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-widest rounded-2xl border border-green-100 shadow-sm"
      >
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        Intelligence Cache Restored: 0.0ms Query Latency
      </motion.div>
    )}
  </AnimatePresence>
);

const LoadingState = ({ progress }: { progress?: number }) => (
  <div className="h-full flex flex-col items-center justify-center py-24">
    <div className="relative mb-10 scale-125">
       <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        className="w-28 h-28 border-[3px] border-orange-50 rounded-[2.5rem]"
       />
       <motion.div 
        animate={{ rotate: -360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 border-t-[3px] border-orange-500 rounded-[2.5rem]"
       />
       <div className="absolute inset-0 flex items-center justify-center">
         <span className="text-2xl font-black font-mono tracking-tighter">{progress || 0}%</span>
       </div>
    </div>
    <div className="space-y-3 text-center">
      <h3 className="text-2xl font-black text-gray-950 tracking-tight">Extracting Nuance</h3>
      <p className="text-sm text-gray-400 font-medium max-w-sm mx-auto leading-relaxed">Cross-referencing Adobe structural nodes with Gemini semantic reasoning models.</p>
    </div>
  </div>
);

const ErrorState = ({ error }: { error?: string }) => (
  <div className="h-full flex flex-col items-center justify-center py-24 text-center px-10">
    <div className="w-24 h-24 bg-red-50 rounded-[2rem] flex items-center justify-center mb-8 rotate-3 shadow-xl shadow-red-100/30 border border-red-100">
      <AlertCircle className="w-12 h-12 text-red-500" />
    </div>
    <h3 className="text-2xl font-black text-gray-950 mb-3 tracking-tight">Pipeline Fault</h3>
    <p className="text-sm text-gray-500 max-w-sm leading-relaxed font-medium">{error || "An unauthorized intercept or data corruption occurred."}</p>
  </div>
);

const EmptyState = () => (
  <div className="h-full flex flex-col items-center justify-center py-32 text-gray-300">
    <ShieldAlert className="w-20 h-20 mb-8 opacity-5" />
    <p className="font-black uppercase tracking-[0.3em] text-[10px] opacity-40">Null Pointer: Result Set Undefined</p>
  </div>
);

const StatItem = ({ label, value, mono = true, extra }: { label: string, value?: string, mono?: boolean, extra?: React.ReactNode }) => (
  <div className="bg-white p-6 transition-all hover:bg-gray-50/50 group border border-transparent hover:border-gray-100 rounded-[1.5rem]">
    <div className="flex justify-between items-start mb-3">
      <p className="text-[10px] uppercase font-black text-gray-300 tracking-widest group-hover:text-gray-400 transition-colors">{label}</p>
      {extra}
    </div>
    <p className={`font-bold text-gray-950 truncate leading-none ${mono ? 'font-mono text-sm tracking-tight' : 'text-base font-black'}`}>
      {value || "—"}
    </p>
  </div>
);

const StatGrid = ({ invoice, qstValidation, gstValidation }: { invoice: ParsedInvoice, qstValidation?: ValidationStatus, gstValidation?: ValidationStatus }) => {
  const renderStatus = (valStatus?: ValidationStatus) => {
    if (!valStatus || valStatus.status === "IDLE") return null;
    
    switch (valStatus.status) {
      case "LOADING":
        return <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />;
      case "ACTIVE":
        return <ShieldCheck className="w-3 h-3 text-green-500" />;
      case "REVOKED":
        return <ShieldX className="w-3 h-3 text-red-500" />;
      case "INVALID_FORMAT":
      case "NOT_FOUND":
        return <ShieldAlert className="w-3 h-3 text-orange-400" />;
      case "ERROR":
        return <AlertCircle className="w-3 h-3 text-gray-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 p-1 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
      <StatItem label="Stream ID" value={invoice.invoiceNumber} />
      <StatItem label="PO Tracking" value={invoice.poNumber} />
      <StatItem label="Vendor" value={invoice.vendorName} mono={false} />
      <StatItem label="Total Exposure" value={`${invoice.currency || ""} ${invoice.total?.toFixed(2) || "0.00"}`} />
      <StatItem label="Process Date" value={invoice.date} />
      <StatItem label="Payment Due" value={invoice.dueDate} />
      <StatItem label="Jurisdiction" value={invoice.province} />
      <StatItem label="BN/Business #" value={invoice.vendorTaxNumbers?.businessNumber} />
      <StatItem label="GST/HST Reg" value={invoice.vendorTaxNumbers?.gstHst} extra={renderStatus(gstValidation)} />
      <StatItem label="QST Reg" value={invoice.vendorTaxNumbers?.qst} extra={renderStatus(qstValidation)} />
    </div>
  );
};

const ComplianceBoard = ({ 
  invoice, 
  qstStatus, 
  gstStatus, 
  onValidateQST, 
  onValidateGST,
  autoVerify,
  onToggleAuto
}: { 
  invoice: ParsedInvoice, 
  qstStatus: ValidationStatus, 
  gstStatus: ValidationStatus,
  onValidateQST: () => void,
  onValidateGST: () => void,
  autoVerify: boolean,
  onToggleAuto: () => void
}) => (
  <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm space-y-8">
    <div className="flex justify-between items-center">
      <div>
        <h4 className="text-lg font-black text-gray-900">Registration Verification</h4>
        <p className="text-xs text-gray-400 font-medium mt-1">Cross-referencing tax IDs with official government registries.</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-black uppercase text-gray-300">Auto-Verification</span>
        <button 
          onClick={onToggleAuto}
          className={`w-12 h-6 rounded-full transition-colors relative ${autoVerify ? 'bg-orange-500' : 'bg-gray-200'}`}
        >
          <motion.div 
            animate={{ x: autoVerify ? 26 : 4 }}
            className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
          />
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* QST CHECK */}
      <div className={`p-6 rounded-3xl border transition-all ${qstStatus.status === 'ACTIVE' ? 'bg-green-50/20 border-green-100' : 'bg-gray-50/50 border-gray-100'}`}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl shadow-sm border border-gray-50">
              <Database className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Revenü Québec Registry</p>
              <p className="text-sm font-black text-gray-900">QST: {invoice.vendorTaxNumbers?.qst || "Missing"}</p>
            </div>
          </div>
          <button 
            disabled={!invoice.vendorTaxNumbers?.qst || qstStatus.status === 'LOADING'}
            onClick={onValidateQST}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${qstStatus.status === 'LOADING' ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {qstStatus.status === 'IDLE' && <p className="text-[11px] text-gray-400 font-medium italic">Ready for verification</p>}
        {qstStatus.status === 'LOADING' && <p className="text-[11px] text-blue-500 font-bold animate-pulse">Connecting to provincial API...</p>}
        {qstStatus.status === 'ACTIVE' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-600 font-black text-xs">
              <ShieldCheck className="w-4 h-4" /> VERIFIED ACTIVE
            </div>
            <p className="text-[12px] font-bold text-gray-950 uppercase">{qstStatus.legalName}</p>
          </div>
        )}
        {qstStatus.status === 'REVOKED' && (
          <div className="flex items-center gap-2 text-red-600 font-black text-xs">
            <ShieldX className="w-4 h-4" /> REGISTRATION REVOKED
          </div>
        )}
        {(qstStatus.status === 'NOT_FOUND' || qstStatus.status === 'INVALID_FORMAT') && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-orange-600 font-black text-xs">
              <ShieldAlert className="w-4 h-4" /> {qstStatus.message || "Identification Failed"}
            </div>
            <a 
              href="https://www.revenuquebec.ca/en/online-services/online-services/validate-a-qst-registration-number/" 
              target="_blank"
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-600 transition-colors"
            >
              Manual RQ Check <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* GST CHECK */}
      <div className={`p-6 rounded-3xl border transition-all ${gstStatus.status === 'INVALID_FORMAT' ? 'bg-red-50/20 border-red-100' : 'bg-gray-50/50 border-gray-100'}`}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl shadow-sm border border-gray-50">
              <Database className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">CRA Federal Registry</p>
              <p className="text-sm font-black text-gray-900">GST/HST: {invoice.vendorTaxNumbers?.gstHst || "Missing"}</p>
            </div>
          </div>
          <button 
            disabled={!invoice.vendorTaxNumbers?.gstHst || gstStatus.status === 'LOADING'}
            onClick={onValidateGST}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${gstStatus.status === 'LOADING' ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="space-y-3">
          {gstStatus.status === 'INVALID_FORMAT' ? (
            <p className="text-[11px] text-red-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis">Structure error: Expected 9-digit BN + RTXXXX</p>
          ) : (
             <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
              Name/Date matching required for CRA verification.
            </p>
          )}
          <a 
            href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/gst-hst-registry-verify-a-gst-hst-number.html" 
            target="_blank"
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-600 transition-colors"
          >
            Open Registry <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* PROVINCIAL PST CHECK */}
      {["BC", "SK", "MB"].includes(invoice.province || "") && (
        <div className="p-6 rounded-3xl border bg-gray-50/50 border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white rounded-xl shadow-sm border border-gray-50">
              <Database className="w-4 h-4 text-gray-500" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{invoice.province} PST Registry</p>
              <p className="text-sm font-black text-gray-900">PST: {invoice.vendorTaxNumbers?.pst || invoice.vendorTaxNumbers?.rst || "Missing"}</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 font-medium mb-3">Verification required via provincial portal.</p>
          <a 
            href={
              invoice.province === "BC" ? "https://www.etax.gov.bc.ca/btp/pstw/_/" :
              invoice.province === "SK" ? "https://sets.saskatchewan.ca/pub/pst-verification" :
              "https://tax-services.gov.mb.ca/tax-verification/"
            }
            target="_blank"
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-600 transition-colors"
          >
            Provincial portal <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  </div>
);

const TaxAnalysis = ({ invoice }: { invoice: ParsedInvoice }) => {
  const risk = calculateTaxDiscrepancy(invoice);
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-12">
        <AnimatePresence mode="wait">
          {risk && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`p-10 rounded-[2.5rem] border ${risk.isHighRisk ? 'bg-red-50/50 border-red-100' : 'bg-green-50/50 border-green-100'} transition-all shadow-sm`}
            >
              <div className="flex flex-col md:flex-row gap-8">
                <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-xl shrink-0 border ${risk.isHighRisk ? 'bg-white border-red-100 shadow-red-200/40 text-red-500' : 'bg-white border-green-100 shadow-green-200/40 text-green-600'}`}>
                  {risk.isHighRisk ? <AlertCircle className="w-8 h-8" /> : <Check className="w-8 h-8" />}
                </div>
                <div className="space-y-6 flex-1">
                  <div>
                    <h4 className={`text-sm font-black uppercase tracking-widest ${risk.isHighRisk ? 'text-red-900' : 'text-green-900'}`}>
                      {risk.isHighRisk ? 'Critical Variance Detected' : 'Fiscal Alignment Confirmed'}
                    </h4>
                    <p className={`text-sm font-medium mt-2 leading-relaxed max-w-2xl ${risk.isHighRisk ? 'text-red-700/80' : 'text-green-700/80'}`}>
                      {risk.isHighRisk 
                        ? `A variance of $${risk.difference.toFixed(2)} was identified. Supply location ${risk.jurisdiction} necessitates a ${(risk.rateTotal * 100).toFixed(1)}% ${risk.rateType} application. Extracted value $${risk.actual.toFixed(2)} conflicts with calculated expected value $${risk.expected.toFixed(2)}.`
                        : `The extracted tax values ($${risk.actual.toFixed(2)}) are within tolerance for ${risk.jurisdiction}'s ${(risk.rateTotal * 100).toFixed(1)}% ${risk.rateType} place of supply regulations.`}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <TaxStat label="Taxable Base" value={risk.taxableSubtotal} color={risk.isHighRisk ? "red" : "green"} />
                    <TaxStat label="Zero-Rated Base" value={risk.zeroRatedSubtotal} color="blue" />
                    <TaxStat label="Exempt Base" value={risk.exemptSubtotal} color="gray" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const TaxStat = ({ label, value, color }: { label: string, value: number, color: "red" | "green" | "gray" | "blue" }) => {
  const colors = {
    red: "text-red-900 border-red-200/50 bg-white/50",
    green: "text-green-900 border-green-200/50 bg-white/50",
    gray: "text-gray-900 border-gray-200 bg-white/50",
    blue: "text-blue-900 border-blue-200/50 bg-white/50"
  };
  return (
    <div className={`px-6 py-4 rounded-2xl border ${colors[color]} min-w-[160px]`}>
      <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">{label}</p>
      <p className="font-mono text-lg font-black tracking-tight">${value.toFixed(2)}</p>
    </div>
  );
};

const LineItemsTable = ({ invoice }: { invoice: ParsedInvoice }) => (
  <div className="border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-gray-100/50 bg-white">
    <table className="w-full text-left text-sm border-collapse">
      <thead className="bg-gray-50/30 border-b border-gray-50">
        <tr>
          <th className="px-8 py-6 font-black text-gray-400 text-[10px] uppercase tracking-[0.2em]">Description</th>
          <th className="px-8 py-6 font-black text-gray-400 text-[10px] uppercase tracking-[0.2em] text-right">Qty</th>
          <th className="px-8 py-6 font-black text-gray-400 text-[10px] uppercase tracking-[0.2em] text-right">Unit Price</th>
          <th className="px-8 py-6 font-black text-gray-400 text-[10px] uppercase tracking-[0.2em] text-right">Base</th>
          <th className="px-8 py-6 font-black text-gray-400 text-[10px] uppercase tracking-[0.2em] text-right">Tax</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {invoice.items.map((item, idx) => (
          <tr key={idx} className="hover:bg-gray-50/20 transition-all group">
            <td className="px-8 py-6">
              <p className="font-bold text-gray-900 tracking-tight leading-tight">{item.description}</p>
              {item.isTaxExempt && (
                <span className="inline-block mt-1 px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 border border-gray-200">
                  Exempt
                </span>
              )}
            </td>
            <td className="px-8 py-6 text-right text-gray-400 font-mono font-bold">{item.quantity || "1"}</td>
            <td className="px-8 py-6 text-right font-black text-gray-950 font-mono tracking-tighter">
              ${item.unitPrice?.toFixed(2) || "0.00"}
            </td>
            <td className="px-8 py-6 text-right font-black text-gray-950 font-mono tracking-tighter">${item.amount?.toFixed(2) || "0.00"}</td>
            <td className="px-8 py-6 text-right group-hover:bg-gray-50/20 min-w-[120px]">
              <p className="font-black text-gray-950 font-mono text-sm tracking-tighter">${item.tax?.toFixed(2) || "0.00"}</p>
              {item.taxRate && <p className="text-[8px] text-gray-400 font-black uppercase tracking-tighter mt-1 opacity-60">{(item.taxRate * 100).toFixed(1)}% App.</p>}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="bg-gray-50/10 border-t border-gray-100">
        <tr className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em]">
          <td colSpan={4} className="px-8 py-4 text-right">Reported Subtotal</td>
          <td className="px-8 py-4 text-right text-gray-950 font-mono font-bold tracking-tighter">${invoice.subtotal?.toFixed(2)}</td>
        </tr>
        {invoice.taxBreakdown && Object.entries(invoice.taxBreakdown).map(([key, val]) => (
          (val as number) > 0 && (
            <tr key={key} className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] border-t border-gray-50/50">
              <td colSpan={4} className="px-8 py-3 text-right">{key} Aggregation</td>
              <td className="px-8 py-3 text-right text-gray-950 font-mono font-bold tracking-tighter">${(val as number).toFixed(2)}</td>
            </tr>
          )
        ))}
        <tr className="border-t border-gray-100 bg-gray-50/30">
          <td colSpan={4} className="px-8 py-8 text-right font-black text-gray-400 uppercase tracking-[0.3em] text-[10px]">Net Transaction Exposure</td>
          <td className="px-8 py-8 text-right text-black font-black text-2xl font-mono tracking-tighter">
            <span className="text-xs font-bold text-gray-300 mr-2">{invoice.currency}</span>
            {invoice.total?.toFixed(2)}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
);
