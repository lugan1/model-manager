import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
  className?: string;
}

export const Tooltip = ({ children, content, position = "top", delay = 200, className = "" }: TooltipProps) => {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let top = 0;
      let left = 0;

      switch (position) {
        case "top":
          top = rect.top + window.scrollY - 10;
          left = rect.left + rect.width / 2;
          break;
        case "bottom":
          top = rect.bottom + window.scrollY + 10;
          left = rect.left + rect.width / 2;
          break;
        case "left":
          top = rect.top + rect.height / 2 + window.scrollY;
          left = rect.left - 10;
          break;
        case "right":
          top = rect.top + rect.height / 2 + window.scrollY;
          left = rect.right + 10;
          break;
      }
      setCoords({ top, left });
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    timerRef.current = setTimeout(() => {
      updatePosition(); // Re-check position right before showing
      setShow(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  };

  useEffect(() => {
    if (show) {
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
    }
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [show]);

  const positionClasses = {
    top: "-translate-x-1/2 -translate-y-full mb-2",
    bottom: "-translate-x-1/2 mt-2",
    left: "-translate-x-full -translate-y-1/2 mr-2",
    right: "ml-2 -translate-y-1/2",
  };

  return (
    <div 
      ref={triggerRef} 
      className={`relative flex items-center ${className}`} 
      onMouseEnter={handleMouseEnter} 
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && createPortal(
        <div 
          style={{ 
            position: 'fixed', 
            top: coords.top, 
            left: coords.left, 
            zIndex: 9999,
            pointerEvents: 'none'
          }}
          className={`whitespace-nowrap bg-[#1f2937]/95 backdrop-blur-md text-white text-[11px] font-black px-3 py-1.5 rounded-xl shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-200 ${positionClasses[position]}`}
        >
          {content}
          {/* Arrow */}
          <div className={`absolute border-[6px] border-transparent ${
            position === "top" ? "top-full left-1/2 -translate-x-1/2 border-t-[#1f2937]" :
            position === "bottom" ? "bottom-full left-1/2 -translate-x-1/2 border-b-[#1f2937]" :
            position === "left" ? "left-full top-1/2 -translate-y-1/2 border-l-[#1f2937]" :
            "right-full top-1/2 -translate-y-1/2 border-r-[#1f2937]"
          }`} />
        </div>,
        document.body
      )}
    </div>
  );
};
