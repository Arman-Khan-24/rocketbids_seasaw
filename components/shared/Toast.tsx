"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertTriangle, X, Info } from "lucide-react";
import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
} from "react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextType {
  addToast: (message: string, type: Toast["type"]) => void;
}

const ToastContext = createContext<ToastContextType>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"]) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 px-3 pb-3 md:inset-auto md:bottom-4 md:right-4 md:px-0 md:pb-0">
        <AnimatePresence>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const icons = {
    success: <CheckCircle size={16} className="text-rocket-teal" />,
    error: <AlertTriangle size={16} className="text-rocket-danger" />,
    info: <Info size={16} className="text-rocket-gold" />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      className="flex w-full items-center gap-3 rounded-lg border border-rocket-border bg-rocket-card px-4 py-3 shadow-lg md:min-w-[280px] md:w-auto"
    >
      {icons[toast.type]}
      <span className="flex-1 text-sm text-rocket-text">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-rocket-muted hover:text-rocket-text"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
