import { Check, AlertCircle, AlertTriangle, X } from "lucide-react";
import { ToastState } from "../../types";

interface ToastProps {
  toast: ToastState;
  onClose: () => void;
}

export const Toast = ({ toast, onClose }: ToastProps) => {
  if (!toast.show) return null;

  const config = {
    error: {
      bg: "bg-red-950/90",
      border: "border-red-500",
      iconBg: "bg-red-500",
      icon: <AlertCircle className="text-white size-8" />,
      text: "text-red-400"
    },
    warning: {
      bg: "bg-yellow-950/90",
      border: "border-yellow-500",
      iconBg: "bg-yellow-500",
      icon: <AlertTriangle className="text-[#0b0f19] size-8" />,
      text: "text-yellow-400"
    },
    success: {
      bg: "bg-[#1f2937]/90",
      border: "border-[#ff9a00]",
      iconBg: "bg-[#ff9a00]",
      icon: <Check className="text-[#0b0f19] size-8 stroke-[4px]" />,
      text: "text-white"
    }
  };

  const style = config[toast.type];

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] animate-in fade-in slide-in-from-bottom-10 duration-500">
      <div className={`border-2 p-6 rounded-3xl shadow-2xl flex items-center gap-6 min-w-[500px] backdrop-blur-xl ${style.bg} ${style.border}`}>
        <div className={`p-3 rounded-2xl ${style.iconBg}`}>
          {style.icon}
        </div>
        <div className="flex-1">
          <h4 className={`text-xl font-black uppercase ${style.text}`}>{toast.message}</h4>
          {toast.subMessage && <p className="text-sm font-bold text-[#9ca3af] mt-1 break-all line-clamp-2 italic">{toast.subMessage}</p>}
        </div>
        <button onClick={onClose} className="text-[#4b5563] hover:text-white transition-colors">
          <X className="size-6" />
        </button>
      </div>
    </div>
  );
};
