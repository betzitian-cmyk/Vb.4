import React, { useState } from "react";
import { FileText, Download, Fingerprint, Activity, Layers, ArrowRight, ShieldAlert, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { UploadZone } from "./components/UploadZone";
import { ProcessingQueue } from "./components/ProcessingQueue";
import { ResultDetail } from "./components/ResultDetail";
import { useInvoiceProcessor } from "./hooks/useInvoiceProcessor";
import { generateIIF, downloadBlob } from "./lib/invoiceUtils";

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [viewMode, setViewMode] = useState<"ui" | "parsed" | "raw">("ui");

  const {
    queue,
    addFiles,
    removeQueueItem,
    clearQueue,
    processQueue,
    retryItem,
    isProcessing
  } = useInvoiceProcessor();

  const selectedItem = queue.find(i => i.id === selectedId);
  const isIframe = window.self !== window.top;

  const handleFilesSelection = (files: File[]) => {
    const newItems = addFiles(files);
    if (!selectedId && newItems.length > 0) setSelectedId(newItems[0].id);
  };

  const handleExportIIF = () => {
    if (!selectedItem?.parsedInvoice) return;
    const iif = generateIIF(selectedItem.parsedInvoice);
    const blob = new Blob([iif], { type: "text/plain" });
    downloadBlob(blob, `${selectedItem.parsedInvoice.invoiceNumber || "invoice"}.iif`);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-gray-950 font-sans selection:bg-orange-100">
      {/* Dynamic Navbar */}
      <header className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-xl border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-4 group cursor-pointer">
            <div className="relative">
              <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center -rotate-6 group-hover:rotate-0 transition-all duration-500 shadow-xl shadow-gray-200">
                <Fingerprint className="text-white w-6 h-6" />
              </div>
              <motion.div 
                animate={{ scale: [1, 1.2, 1] }} 
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-white" 
              />
            </div>
            <div>
              <span className="font-black text-xl tracking-tight block leading-none">applechAI</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Document Intelligence v1.1</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
             <div className="hidden lg:flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-100">
                   <Activity className="w-3 h-3 text-green-500" />
                   <span>Adobe Extraction Online</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-100">
                   <Layers className="w-3 h-3 text-orange-500" />
                   <span>OpenRouter Pipeline Active</span>
                </div>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 pt-32 pb-24">
        {isIframe && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-orange-50 border border-orange-100 rounded-3xl flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-xl shadow-sm text-orange-500">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-orange-900 leading-relaxed">
                App running in Preview Frame. If you encounter session errors, please open the app in a new tab to bypass cookie restrictions.
              </p>
            </div>
            <button 
              onClick={() => window.open(window.location.href, '_blank')}
              className="px-5 py-2.5 bg-orange-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 shrink-0"
            >
              Open New Tab
            </button>
          </motion.div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          
          {/* Dashboard Left: Inputs */}
          <section className="lg:col-span-4 space-y-8">
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-2xl shadow-gray-100/50 space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-black tracking-tight">Ingest Pipeline</h2>
                <p className="text-sm text-gray-400 font-medium leading-relaxed italic serif">Stream multi-page documents directly into the extraction engine.</p>
              </div>

              <UploadZone 
                onFilesSelection={handleFilesSelection} 
                isDragging={dragActive} 
                onDrag={(e) => { e.preventDefault(); setDragActive(e.type !== "dragleave"); }} 
                onDrop={(e) => { 
                  e.preventDefault(); 
                  setDragActive(false); 
                  if (e.dataTransfer.files) {
                    handleFilesSelection(Array.from(e.dataTransfer.files));
                  }
                }}
                queueLength={queue.length}
              />

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={queue.length === 0 || isProcessing || !queue.some(i => i.status === "pending" || i.status === "error")}
                onClick={processQueue}
                className="w-full py-5 bg-black text-white rounded-3xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-gray-900 transition-all disabled:bg-gray-100 disabled:text-gray-300 shadow-xl shadow-gray-200"
              >
                {isProcessing ? "Executing Stream..." : "Initiate Extraction"}
                <ArrowRight className={`w-4 h-4 transition-transform ${isProcessing ? 'translate-x-10 opacity-0' : ''}`} />
              </motion.button>
            </div>

            <ProcessingQueue 
              items={queue} 
              selectedId={selectedId} 
              onSelect={setSelectedId} 
              onRemove={removeQueueItem}
              onClear={clearQueue}
              onRetry={retryItem}
              isProcessing={isProcessing}
            />
          </section>

          {/* Dashboard Right: Analysis */}
          <section className="lg:col-span-8">
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-2xl shadow-gray-100/50 min-h-[600px] flex flex-col overflow-hidden">
              <AnimatePresence mode="wait">
                {selectedItem ? (
                  <motion.div 
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col h-full"
                  >
                    <header className="px-10 py-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gray-50/20">
                      <div className="flex gap-1 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm self-start">
                        {["ui", "parsed", "raw"].map(mode => (
                          <button 
                            key={mode}
                            onClick={() => setViewMode(mode as any)}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                              viewMode === mode 
                                ? "bg-black text-white shadow-lg" 
                                : "text-gray-400 hover:text-black hover:bg-gray-50"
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                      
                      <button 
                        onClick={handleExportIIF}
                        disabled={selectedItem.status !== "completed"}
                        className="flex items-center gap-3 px-6 py-3 bg-white border border-gray-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 hover:border-gray-300 disabled:opacity-20 transition-all shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        QuickBooks IIF
                      </button>
                    </header>

                    <div className="flex-1 p-10 overflow-y-auto max-h-[800px] custom-scrollbar">
                      <ResultDetail item={selectedItem} viewMode={viewMode} />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col items-center justify-center py-48 text-center px-10"
                  >
                    <div className="relative mb-8">
                      <div className="w-24 h-24 bg-gray-50 rounded-3xl flex items-center justify-center -rotate-6">
                        <FileText className="w-12 h-12 text-gray-200" />
                      </div>
                      <motion.div 
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute -top-4 -right-4 w-12 h-12 bg-white rounded-2xl shadow-lg border border-gray-50 flex items-center justify-center"
                      >
                        <Activity className="w-6 h-6 text-orange-200" />
                      </motion.div>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Ready for Ingestion</h3>
                    <p className="text-sm text-gray-400 max-w-xs mx-auto leading-relaxed font-medium">Select a staged document from the pipeline queue to visualize the deep extraction results.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
