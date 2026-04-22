import { useState } from "react";
import { DirNode } from "../../types";
import { ChevronRight, ChevronDown, FolderOpen } from "lucide-react";

interface TreeItemProps {
  node: DirNode;
  level: number;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
}

export const TreeItem = ({ node, level, selectedPath, onSelect }: TreeItemProps) => {
  const [isOpen, setIsOpen] = useState(level === 0);
  const hasChildren = Object.keys(node.children).length > 0;
  const isSelected = selectedPath === node.path;

  return (
    <div className="select-none">
      <div 
        className={`flex items-center py-2 px-3 rounded-lg cursor-pointer transition-colors ${
          isSelected ? "bg-[#ff9a00]/20 text-[#ff9a00]" : "hover:bg-white/5 text-[#9ca3af]"
        }`}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={() => onSelect(node.path === "" ? null : node.path)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hasChildren ? (
            <button 
              onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} 
              className="p-1 hover:bg-white/10 rounded"
            >
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ) : (
            <div className="size-6" />
          )}
          <FolderOpen className={`size-5 flex-shrink-0 ${isSelected ? "text-[#ff9a00]" : "text-[#4b5563]"}`} />
          <span className="truncate font-bold text-sm">{node.name}</span>
        </div>
      </div>
      {isOpen && hasChildren && (
        <div className="mt-1">
          {Object.values(node.children)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(child => (
              <TreeItem key={child.path} node={child} level={level + 1} selectedPath={selectedPath} onSelect={onSelect} />
            ))}
        </div>
      )}
    </div>
  );
};
