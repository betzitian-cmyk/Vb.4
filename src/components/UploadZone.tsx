import React from "react";
import { Upload, CheckCircle2, FileUp, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface UploadZoneProps {
  onFilesSelection: (files: File[]) => void;
  isDragging: boolean;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  queueLength: number;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ 
  onFilesSelection, isDragging, onDrag, onDrop, queueLength 
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFilesSelection(Array.from(e.target.files));
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onDragEnter={onDrag}
      onDragLeave={onDrag}
      onDragOver={onDrag}
      onDrop={onDrop}
      className={`relative group cursor-pointer border-2 border-dashed rounded-[3rem] transition-all duration-700 p-14 text-center flex flex-col items-center justify-center gap-8 shadow-sm ${
        isDragging 
          ? "border-orange-500 bg-orange-50/30 scale-[1.02] shadow-2xl shadow-orange-100/50" 
          : "border-gray-100 bg-white hover:border-gray-400 hover:shadow-2xl hover:shadow-gray-100"
      }`}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleChange}
        accept="application/pdf,image/*"
        multiple
        className="hidden"
      />
      
      <div className="relative">
        <div className={`w-28 h-28 rounded-[2.5rem] flex items-center justify-center transition-all duration-700 shadow-inner border ${
          isDragging ? "rotate-12 scale-110 border-orange-200" : ""
        } ${
          queueLength > 0 ? "bg-green-50 text-green-600 border-green-100" : "bg-gray-50 text-gray-300 border-gray-100 group-hover:bg-gray-950 group-hover:text-white group-hover:-rotate-12"
        }`}>
          {queueLength > 0 ? <CheckCircle2 className="w-12 h-12" /> : <FileUp className="w-12 h-12" />}
        </div>
        
        <AnimatePresence>
          {isDragging && (
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute -top-3 -right-3 bg-orange-500 text-white p-2.5 rounded-full shadow-2xl z-20"
            >
              <Upload className="w-5 h-5" />
            </motion.div>
          )}
        </AnimatePresence>

        {queueLength === 0 && (
           <div className="absolute -bottom-2 -left-2 w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center animate-bounce group-hover:hidden">
            <Sparkles className="w-4 h-4 text-orange-600" />
           </div>
        )}
      </div>

      <div className="space-y-3">
        <h4 className="font-black text-gray-950 text-xl tracking-tight leading-tight">
          {queueLength > 0 ? `${queueLength} Documents Ingested` : "Initiate Ingestion"}
        </h4>
        <p className="text-sm text-gray-400 font-medium max-w-[200px] leading-relaxed">
          {isDragging ? "Release to capture" : <>Drag documents or <span className="text-orange-600 font-bold decoration-orange-200 underline underline-offset-4">browse filesystem</span></>}
        </p>
      </div>

      {/* Decorative corners */}
      <div className="absolute top-8 left-8 w-4 h-4 border-t-2 border-l-2 border-gray-100 rounded-tl-lg group-hover:border-orange-500 transition-colors" />
      <div className="absolute bottom-8 right-8 w-4 h-4 border-b-2 border-r-2 border-gray-100 rounded-br-lg group-hover:border-orange-500 transition-colors" />
    </motion.div>
  );
};
