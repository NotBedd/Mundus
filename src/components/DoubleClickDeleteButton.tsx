import React, { useState, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';

interface DoubleClickDeleteButtonProps {
  onDelete: () => void;
  title?: string;
  className?: string;
  iconClassName?: string;
  id?: string;
}

export const DoubleClickDeleteButton: React.FC<DoubleClickDeleteButtonProps> = ({
  onDelete,
  title = 'Double click to delete',
  className = '',
  iconClassName = 'w-2.5 h-2.5',
  id,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isConfirming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsConfirming(false);
      onDelete();
    } else {
      setIsConfirming(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIsConfirming(false);
      }, 2500);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsConfirming(false);
    onDelete();
  };

  return (
    <button
      id={id}
      type="button"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={isConfirming ? 'Click again to confirm delete' : title}
      className={`transition-all cursor-pointer ${className} ${
        isConfirming
          ? '!text-red-500 !bg-red-500/20 ring-1 ring-red-500/50 !opacity-100 scale-105'
          : 'hover:text-red-500 hover:bg-red-500/10 dark:hover:bg-red-500/20'
      }`}
    >
      <Trash2 className={iconClassName} />
    </button>
  );
};
