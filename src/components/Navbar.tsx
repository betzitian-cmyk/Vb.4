import React from "react";
import { Fingerprint, Activity, Layers } from "lucide-react";
import { motion } from "motion/react";

export const Navbar: React.FC = () => {
  return (
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
  );
};