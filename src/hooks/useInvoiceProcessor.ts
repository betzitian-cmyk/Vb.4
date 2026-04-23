import { useState, useCallback, useRef } from "react";
import { QueueItem, ExtractionResult } from "../types";
import { parseInvoiceWithAI } from "../lib/invoiceUtils";

export function useInvoiceProcessor() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const addFiles = useCallback((files: File[]) => {
    const newItems: QueueItem[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: "pending" as const,
      progress: 0
    }));
    setQueue(prev => [...prev, ...newItems]);
    return newItems;
  }, []);

  const updateStatus = useCallback((id: string, status: QueueItem["status"], progress?: number, error?: string) => {
    setQueue(prev => prev.map(q => 
      q.id === id ? { ...q, status, progress: progress ?? q.progress, error } : q
    ));
  }, []);

  const removeQueueItem = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const extractPdf = async (file: File): Promise<ExtractionResult> => {
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await fetch("/api/extract", { 
        method: "POST", 
        body: formData,
        credentials: "include" // Ensure session cookies are sent in iframe
      });
      
      const contentType = res.headers.get("content-type");
      if (!res.ok) {
        if (contentType && contentType.includes("application/json")) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Server error (${res.status})`);
        } else {
          const text = await res.text();
          if (text.includes("Cookie check") || text.includes("redirectToReturnUrl")) {
            throw new Error("Session expired or cookies blocked. Please open this app in a new tab to re-authenticate.");
          }
          console.error("Non-JSON Error Response:", text);
          throw new Error(`Server returned HTML/Text (${res.status}). This usually indicates a timeout or proxy error.`);
        }
      }

      if (contentType && !contentType.includes("application/json")) {
        const text = await res.text();
        if (text.includes("Cookie check") || text.includes("redirectToReturnUrl")) {
          throw new Error("Session expired or cookies blocked. Please open this app in a new tab to re-authenticate.");
        }
        console.error("Unexpected non-JSON success response:", text);
        throw new Error("Server returned HTML instead of JSON. This often happens due to an environment session timeout.");
      }

      return await res.json();
    } catch (err: any) {
      if (err.name === "SyntaxError") {
        throw new Error(`Step 1 (Adobe): Response was not valid JSON. The server likely timed out or encountered a session error.`);
      }
      throw new Error(`Step 1 (Adobe): ${err.message}`);
    }
  };

  const executeTask = async (item: QueueItem) => {
    try {
      updateStatus(item.id, "processing", 10);
      const raw = await extractPdf(item.file);
      
      updateStatus(item.id, "processing", 50);
      const parsed = await parseInvoiceWithAI(raw);

      setQueue(prev => prev.map(q => q.id === item.id ? 
        { ...q, status: "completed", progress: 100, rawResult: raw, parsedInvoice: parsed } : q
      ));
    } catch (err: any) {
      updateStatus(item.id, "error", 0, err.message);
      throw err;
    }
  };

  const processQueue = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      // Refresh pool from current queue
      const pending = queue.filter(i => i.status === "pending" || i.status === "error");
      if (pending.length === 0) return;

      const CONCURRENCY_LIMIT = 2; // Reduced for stability on Adobe Free Tier
      const pool = [...pending];
      
    const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, pool.length) }).map(async () => {
        while (pool.length > 0) {
          const item = pool.shift();
          if (item) {
            try {
              await executeTask(item);
            } catch (e) {
              console.error(`Execution failure for ${item.file.name}:`, e);
            }
          }
        }
      });

      await Promise.all(workers);
    } finally {
      setIsProcessing(false);
    }
  }, [queue, isProcessing, updateStatus]);

  const retryItem = useCallback(async (id: string) => {
    setQueue(prev => {
      const item = prev.find(i => i.id === id);
      if (!item) return prev;
      
      // If found, immediately start processing it in isolation
      (async () => {
        setIsProcessing(true);
        try {
          await executeTask(item);
        } finally {
          setIsProcessing(false);
        }
      })();
      
      return prev;
    });
  }, []);

  return { 
    queue, 
    addFiles, 
    removeQueueItem,
    clearQueue,
    processQueue, 
    retryItem,
    isProcessing 
  };
}
