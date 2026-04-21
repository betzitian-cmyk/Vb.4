import React from "react";
import { CheckCircle2, AlertCircle, Loader2, Clock, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QueueItem } from "../types";

interface ProcessingQueueProps {
  items: QueueItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onRetry: (id: string) => void;
  isProcessing: boolean;
}

export const ProcessingQueue: React.FC<ProcessingQueueProps> = ({
  items, selectedId, onSelect, onRemove, onClear, onRetry, isProcessing
}) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">Pipeline Inventory</h3>
        </div>
        <button 
          onClick={onClear}
          disabled={isProcessing}
          className="text-[10px] font-black text-red-400 uppercase tracking-widest hover:text-red-600 disabled:opacity-20 transition-all cursor-pointer"
        >
          Purge Queue
        </button>
      </div>

      <div className="space-y-3 max-h-[450px] overflow-y-auto px-1 custom-scrollbar">
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((item) => (
            <motion.div 
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 20 }}
              onClick={() => onSelect(item.id)}
              className={`relative overflow-hidden p-5 rounded-[1.8rem] border transition-all cursor-pointer group select-none ${
                selectedId === item.id 
                  ? "bg-white border-gray-950 shadow-2xl shadow-gray-200 z-10" 
                  : "bg-gray-50/50 border-gray-100 hover:border-gray-300 hover:bg-white"
              }`}
            >
              {item.status === "processing" && (
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${item.progress || 0}%` }}
                  className="absolute bottom-0 left-0 h-1 bg-orange-500 transition-all duration-500"
                />
              )}

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 group-hover:rotate-3 ${
                    item.status === "completed" ? "bg-green-50 text-green-600 border border-green-100" :
                    item.status === "error" ? "bg-red-50 text-red-600 border border-red-100" :
                    item.status === "processing" ? "bg-orange-50 text-orange-600 border border-orange-100" :
                    "bg-white text-gray-300 border border-gray-100"
                  }`}>
                    {item.status === "completed" ? <CheckCircle2 className="w-6 h-6" /> :
                     item.status === "error" ? <AlertCircle className="w-6 h-6" /> :
                     item.status === "processing" ? <Loader2 className="w-6 h-6 animate-spin" /> :
                     <Clock className="w-6 h-6" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-black truncate transition-colors leading-tight mb-1 ${
                      selectedId === item.id ? "text-gray-950" : "text-gray-600"
                    }`}>
                      {item.file.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase tracking-widest ${
                        item.status === "processing" ? "text-orange-500" :
                        item.status === "completed" ? "text-green-600" :
                        item.status === "error" ? "text-red-500" :
                        "text-gray-400"
                      }`}>
                        {item.status === "processing" ? `Stream: ${item.progress || 0}%` : item.status}
                      </span>
                      {item.status === "error" && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetry(item.id);
                          }}
                          className="text-[9px] font-black uppercase tracking-tighter text-orange-600 hover:text-orange-700 underline underline-offset-4 decoration-orange-200"
                        >
                          Manual Retry
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.id);
                  }}
                  disabled={isProcessing && item.status === "processing"}
                  className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all disabled:opacity-0 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
