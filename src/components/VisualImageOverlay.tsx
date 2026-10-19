import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Trash2, 
  Maximize2, 
  AlignLeft, 
  AlignCenter, 
  AlignRight
} from 'lucide-react';
import type { DocumentVisualImage } from '../types';

interface VisualImageOverlayProps {
  documentId?: string;
  images: DocumentVisualImage[];
  onUpdateImage: (image: DocumentVisualImage) => void;
  onDeleteImage: (imageId: string) => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  editorRef?: React.RefObject<HTMLDivElement | null>;
  isDarkMode: boolean;
  pageZoom?: number;
  documentContent?: string;
  accentColor?: string;
  onImageLoad?: () => void;
}

export const VisualImageOverlay: React.FC<VisualImageOverlayProps> = ({
  documentId,
  images,
  onUpdateImage,
  onDeleteImage,
  editorRef,
  isDarkMode,
  documentContent,
  accentColor,
  onImageLoad,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [portalMap, setPortalMap] = useState<Record<string, HTMLElement>>({});

  // Sync DOM portal nodes inside contentEditable editor container
  const syncPortals = useCallback(() => {
    if (!editorRef?.current) return;
    const container = editorRef.current;
    const nextPortalMap: Record<string, HTMLElement> = {};

    // 1. Find or create portal DOM container for each image
    images.forEach((img) => {
      let portalEl = container.querySelector(`[data-visual-image-id="${img.id}"]`) as HTMLElement | null;

      if (!portalEl) {
        portalEl = window.document.createElement('figure');
        portalEl.setAttribute('data-visual-image-id', img.id);
        portalEl.setAttribute('contenteditable', 'false');
        portalEl.className = 'visual-image-portal-node my-6 block select-none cursor-default relative';
        portalEl.style.minHeight = '240px';
        portalEl.style.height = '240px';
        
        // Append to container or insert near current selection
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (container.contains(range.commonAncestorContainer)) {
            const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE 
              ? (range.startContainer as HTMLElement) 
              : range.startContainer.parentElement;
            
            const paragraph = anchor?.closest('p, div, blockquote, h1, h2, h3');
            const targetParent = paragraph?.parentElement || container.querySelector('.mundus-page-body') || container;
            if (paragraph && paragraph.parentElement) {
              paragraph.parentElement.insertBefore(portalEl, paragraph.nextSibling);
            } else {
              targetParent.appendChild(portalEl);
            }
          } else {
            container.appendChild(portalEl);
          }
        } else {
          container.appendChild(portalEl);
        }
      }

      // Guarantee an editable paragraph immediately following the image figure
      let nextElem = portalEl.nextElementSibling;
      if (!nextElem || nextElem.getAttribute('contenteditable') === 'false') {
        const newP = window.document.createElement('p');
        newP.innerHTML = '<br>';
        if (nextElem) {
          container.insertBefore(newP, nextElem);
        } else {
          container.appendChild(newP);
        }
      }

      nextPortalMap[img.id] = portalEl;
    });

    // 2. Clean up any portal elements whose image was deleted
    const allExisting = container.querySelectorAll('[data-visual-image-id]');
    allExisting.forEach((node) => {
      const id = node.getAttribute('data-visual-image-id');
      if (id && !images.some((img) => img.id === id)) {
        node.remove();
      }
    });

    setPortalMap(nextPortalMap);
  }, [images, editorRef]);

  // Sync DOM portal nodes immediately and whenever container changes or DOM mutations occur
  useEffect(() => {
    syncPortals();

    // Double sync on animation frame to guarantee alignment if parent updated innerHTML on the same tick
    const rafId = requestAnimationFrame(() => {
      syncPortals();
    });

    const container = editorRef?.current;
    if (!container) {
      return () => cancelAnimationFrame(rafId);
    }

    const observer = new MutationObserver(() => {
      syncPortals();
    });

    observer.observe(container, { childList: true, subtree: false });

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [syncPortals, editorRef, documentContent, documentId]);

  // Click outside listener to deselect image
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.visual-image-item')) {
        setSelectedId(null);
      }
    };
    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, []);

  if (!images || images.length === 0) {
    return null;
  }

  return (
    <>
      {images.map((img) => {
        const portalNode = portalMap[img.id];
        if (!portalNode || !portalNode.isConnected) return null;

        return createPortal(
          <VisualImageItem
            key={img.id}
            img={img}
            isSelected={selectedId === img.id}
            onSelect={() => setSelectedId(img.id)}
            onUpdate={onUpdateImage}
            onDelete={onDeleteImage}
            isDarkMode={isDarkMode}
            accentColor={accentColor}
            onLoad={onImageLoad}
          />,
          portalNode
        );
      })}
    </>
  );
};

interface VisualImageItemProps {
  img: DocumentVisualImage;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (img: DocumentVisualImage) => void;
  onDelete: (id: string) => void;
  isDarkMode: boolean;
  accentColor?: string;
  onLoad?: () => void;
}

const VisualImageItem: React.FC<VisualImageItemProps> = ({
  img,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  isDarkMode,
  accentColor,
  onLoad,
}) => {
  const [activeResize, setActiveResize] = useState<{
    startX: number;
    origWidth: number;
    currentWidth: number;
  } | null>(null);

  const effectiveAccent = accentColor || 'var(--mundus-accent, #c29b38)';
  const isLight = (colorStr: string) => {
    if (colorStr.startsWith('#')) {
      const hex = colorStr.replace('#', '');
      if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 > 160;
      }
    }
    return false;
  };
  const activeBtnTextColor = isLight(accentColor || '') ? '#000000' : '#ffffff';

  const alignment = img.alignment || 'center';
  const displayWidth = activeResize ? activeResize.currentWidth : (img.width || 280);

  // Resize listener
  useEffect(() => {
    if (!activeResize) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - activeResize.startX;
      const newWidth = Math.max(220, Math.min(760, Math.round(activeResize.origWidth + deltaX)));
      setActiveResize((prev) => prev ? { ...prev, currentWidth: newWidth } : null);
    };

    const handleMouseUp = () => {
      onUpdate({
        ...img,
        width: activeResize.currentWidth,
      });
      setActiveResize(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeResize, img, onUpdate]);

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    setActiveResize({
      startX: e.clientX,
      origWidth: displayWidth,
      currentWidth: displayWidth,
    });
  };

  // Inline container alignment styling (Block level: text always stays cleanly above and skips below)
  const getContainerStyle = (): React.CSSProperties => {
    if (alignment === 'left') {
      return {
        display: 'block',
        margin: '1.5rem auto 1.5rem 0',
        clear: 'both',
        width: `${displayWidth}px`,
        maxWidth: '100%',
      };
    }
    if (alignment === 'right') {
      return {
        display: 'block',
        margin: '1.5rem 0 1.5rem auto',
        clear: 'both',
        width: `${displayWidth}px`,
        maxWidth: '100%',
      };
    }
    // Default Center
    return {
      display: 'block',
      margin: '1.5rem auto',
      clear: 'both',
      width: `${displayWidth}px`,
      maxWidth: '100%',
    };
  };

  return (
    <div
      className="visual-image-item relative group transition-all"
      style={getContainerStyle()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Top Floating Control Bar - ONLY VISIBLE WHEN SELECTED */}
      {isSelected && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1.5 rounded-2xl shadow-2xl bg-black/90 border border-neutral-700 text-white backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none">
          {/* Size Preset Buttons */}
          <div className="flex items-center gap-1 pr-1.5 border-r border-neutral-700/80">
            <button
              type="button"
              onClick={() => onUpdate({ ...img, width: 280 })}
              style={displayWidth <= 300 ? { backgroundColor: effectiveAccent, color: activeBtnTextColor } : undefined}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-colors cursor-pointer ${
                displayWidth <= 300 ? 'shadow-xs' : 'hover:bg-neutral-800 text-neutral-300'
              }`}
            >
              S
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ ...img, width: 480 })}
              style={displayWidth > 300 && displayWidth <= 520 ? { backgroundColor: effectiveAccent, color: activeBtnTextColor } : undefined}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-colors cursor-pointer ${
                displayWidth > 300 && displayWidth <= 520 ? 'shadow-xs' : 'hover:bg-neutral-800 text-neutral-300'
              }`}
            >
              M
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ ...img, width: 680 })}
              style={displayWidth > 520 ? { backgroundColor: effectiveAccent, color: activeBtnTextColor } : undefined}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-colors cursor-pointer ${
                displayWidth > 520 ? 'shadow-xs' : 'hover:bg-neutral-800 text-neutral-300'
              }`}
            >
              L
            </button>
          </div>

          {/* Alignment Toggles */}
          <div className="flex items-center gap-1 pr-1.5 border-r border-neutral-700/80">
            <button
              type="button"
              title="Align Left"
              onClick={() => onUpdate({ ...img, alignment: 'left' })}
              style={alignment === 'left' ? { backgroundColor: effectiveAccent, color: activeBtnTextColor } : undefined}
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                alignment === 'left' ? 'shadow-xs' : 'hover:bg-neutral-800 text-neutral-300'
              }`}
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Align Center"
              onClick={() => onUpdate({ ...img, alignment: 'center' })}
              style={alignment === 'center' ? { backgroundColor: effectiveAccent, color: activeBtnTextColor } : undefined}
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                alignment === 'center' ? 'shadow-xs' : 'hover:bg-neutral-800 text-neutral-300'
              }`}
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Align Right"
              onClick={() => onUpdate({ ...img, alignment: 'right' })}
              style={alignment === 'right' ? { backgroundColor: effectiveAccent, color: activeBtnTextColor } : undefined}
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                alignment === 'right' ? 'shadow-xs' : 'hover:bg-neutral-800 text-neutral-300'
              }`}
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Delete Button */}
          <button
            type="button"
            title="Delete Image"
            onClick={() => onDelete(img.id)}
            className="p-1 rounded-lg text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Image Figure Wrapper */}
      <div
        style={isSelected ? {
          borderColor: effectiveAccent,
          boxShadow: `0 0 0 2px ${effectiveAccent}, 0 20px 25px -5px rgba(0, 0, 0, 0.25)`
        } : undefined}
        className={`relative rounded-2xl overflow-hidden transition-all ${
          isSelected
            ? 'border'
            : isDarkMode
            ? 'border border-neutral-800 hover:border-neutral-700'
            : 'border border-neutral-200 hover:border-neutral-300 shadow-xs'
        }`}
      >
        <img
          src={img.url}
          alt={img.caption || 'Illustration'}
          onLoad={() => onLoad?.()}
          className="w-full h-auto block rounded-xl object-cover pointer-events-none select-none"
        />

        {/* Resize Corner Handle - ONLY VISIBLE WHEN SELECTED */}
        {isSelected && (
          <div
            onMouseDown={handleStartResize}
            title="Drag to resize image width"
            style={{
              borderColor: `${effectiveAccent}99`,
              color: effectiveAccent,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = effectiveAccent;
              e.currentTarget.style.color = activeBtnTextColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
              e.currentTarget.style.color = effectiveAccent;
            }}
            className="absolute bottom-2 right-2 p-1.5 rounded-xl bg-black/85 shadow-xl cursor-ew-resize transition-all z-20 border"
          >
            <Maximize2 className="w-3.5 h-3.5 rotate-90" />
          </div>
        )}
      </div>

      {/* Caption Section - ALWAYS VISIBLE BELOW IMAGE */}
      <div className="mt-2 text-center select-text space-y-1">
        {isSelected ? (
          <input
            type="text"
            value={img.caption || ''}
            onChange={(e) => onUpdate({ ...img, caption: e.target.value })}
            placeholder="Type image caption..."
            onFocus={(e) => {
              e.currentTarget.style.borderColor = effectiveAccent;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '';
            }}
            className={`w-full text-center text-xs italic font-serif px-3 py-1 rounded-lg border focus:outline-none transition-colors ${
              isDarkMode
                ? 'bg-neutral-900 border-neutral-700 text-neutral-200'
                : 'bg-white border-neutral-300 text-neutral-800'
            }`}
          />
        ) : (
          <figcaption 
            className="text-xs italic font-serif text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer transition-colors"
            onClick={onSelect}
          >
            {img.caption || 'a view of the illustration'}
          </figcaption>
        )}
      </div>
    </div>
  );
};
