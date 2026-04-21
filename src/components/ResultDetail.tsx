import React from "react";
import { Brain, AlertCircle, Copy, Check, Zap, ReceiptText, ShieldAlert } from "lucide-react";
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

export const ResultDetail: React.FC<ResultDetailProps> = ({ item, viewMode }) => {
  const { parsedInvoice, rawResult, status, error, progress } = item;
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    const text = JSON.stringify(viewMode === "raw" ? rawResult : parsedInvoice, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status === "processing") return <LoadingState progress={progress} />;
  if (status === "error") return <ErrorState error={error} />;
  if (!parsedInvoice && status === "completed") return <EmptyState />;

  if (viewMode === "ui" && parsedInvoice) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-12"
      >
        <CacheHitBadge show={!!parsedInvoice.cached} />
        <section className="space-y-6">
          <SectionHeader icon={<Zap className="w-5 h-5" />} title="Operational Overview" />
          <StatGrid invoice={parsedInvoice} />
        </section>

        <section className="space-y-6">
          <SectionHeader icon={<Brain className="w-5 h-5 text-orange-500" />} title="Semantic Analysis" />
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

const StatItem = ({ label, value, mono = true }: { label: string, value?: string, mono?: boolean }) => (
  <div className="bg-white p-6 transition-all hover:bg-gray-50/50 group border border-transparent hover:border-gray-100 rounded-[1.5rem]">
    <p className="text-[10px] uppercase font-black text-gray-300 tracking-widest mb-3 group-hover:text-gray-400 transition-colors">{label}</p>
    <p className={`font-bold text-gray-950 truncate leading-none ${mono ? 'font-mono text-sm tracking-tight' : 'text-base font-black'}`}>
      {value || "—"}
    </p>
  </div>
);

const StatGrid = ({ invoice }: { invoice: ParsedInvoice }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 p-1 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
    <StatItem label="Stream ID" value={invoice.invoiceNumber} />
    <StatItem label="Vendor" value={invoice.vendorName} mono={false} />
    <StatItem label="Process Date" value={invoice.date} />
    <StatItem label="Total Exposure" value={`${invoice.currency || ""} ${invoice.total?.toFixed(2) || "0.00"}`} />
    <StatItem label="Jurisdiction" value={invoice.province} />
    <StatItem label="BN/Business #" value={invoice.vendorTaxNumbers?.businessNumber} />
    <StatItem label="GST/HST Reg" value={invoice.vendorTaxNumbers?.gstHst} />
    <StatItem label="QST Reg" value={invoice.vendorTaxNumbers?.qst} />
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

      <div className="lg:col-span-12 p-8 bg-black rounded-[2.5rem] flex gap-6 items-start shadow-2xl shadow-gray-200 border border-gray-900">
        <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center shadow-inner shrink-0 border border-white/5">
          <Brain className="w-7 h-7 text-orange-500" />
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-500/80">LLM Intent Deciphered</p>
          <p className="text-base text-gray-300 italic font-serif leading-relaxed pr-10">
            {invoice.summary || "Extracting high-precision semantic meaning from OCR-less layout trees and visual document features..."}
          </p>
        </div>
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
          <th className="px-8 py-6 font-black text-gray-400 text-[10px] uppercase tracking-[0.2em] text-center">ML Group</th>
          <th className="px-8 py-6 font-black text-gray-400 text-[10px] uppercase tracking-[0.2em] text-right">Qty</th>
          <th className="px-8 py-6 font-black text-gray-400 text-[10px] uppercase tracking-[0.2em] text-right">Base</th>
          <th className="px-8 py-6 font-black text-gray-400 text-[10px] uppercase tracking-[0.2em] text-right">Tax</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {invoice.items.map((item, idx) => (
          <tr key={idx} className="hover:bg-gray-50/20 transition-all group">
            <td className="px-8 py-6">
              <p className="font-bold text-gray-900 tracking-tight leading-tight">{item.description}</p>
            </td>
            <td className="px-8 py-6 text-center">
              <span className={`inline-block px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-colors ${
                item.taxabilityGroup === "Taxable" ? "bg-green-50 text-green-700 border-green-100 group-hover:bg-green-100" :
                item.taxabilityGroup === "Zero-Rated" ? "bg-blue-50 text-blue-700 border-blue-100 group-hover:bg-blue-100" :
                item.taxabilityGroup === "Exempt" ? "bg-gray-50 text-gray-500 border-gray-100 group-hover:bg-gray-100" :
                "bg-gray-50 text-gray-400 border-gray-100 opacity-50"
              }`}>
                {item.taxabilityGroup || "Undef"}
              </span>
            </td>
            <td className="px-8 py-6 text-right text-gray-400 font-mono font-bold">{item.quantity || "1"}</td>
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
