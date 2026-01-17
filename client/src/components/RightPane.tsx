import { useCallback, useEffect, useRef, useState } from 'react';

interface RightPaneProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onToggle: () => void;
  children: React.ReactNode;
  /** Minimum width in pixels (default: 320) */
  minWidth?: number;
  /** Maximum width in pixels (default: 600) */
  maxWidth?: number;
  /** Default width in pixels (default: 420) */
  defaultWidth?: number;
}

// Storage keys for persistence
const STORAGE_KEY_WIDTH = 'mandu-right-pane-width';
const STORAGE_KEY_OPEN = 'mandu-right-pane-open';

// Safe localStorage access (handles private browsing)
const getStoredValue = <T,>(key: string, defaultValue: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return JSON.parse(stored) as T;
  } catch {
    return defaultValue;
  }
};

const setStoredValue = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently fail in private browsing
  }
};

// Hook to detect if we're on desktop (lg breakpoint = 1024px)
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsDesktop(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isDesktop;
}

export function RightPane({
  isOpen,
  onClose,
  onOpen,
  onToggle,
  children,
  minWidth = 320,
  maxWidth = 600,
  defaultWidth = 420,
}: RightPaneProps) {
  const isDesktop = useIsDesktop();

  // Resizable width state with persistence
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return defaultWidth;
    return getStoredValue(STORAGE_KEY_WIDTH, defaultWidth);
  });

  // Refs for focus management
  const paneRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(width);

  // Touch/swipe state (mobile only)
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Swipe thresholds
  const SWIPE_THRESHOLD = 100;
  const VELOCITY_THRESHOLD = 0.3;

  // Persist width changes
  useEffect(() => {
    setStoredValue(STORAGE_KEY_WIDTH, width);
  }, [width]);

  // Persist open state changes
  useEffect(() => {
    setStoredValue(STORAGE_KEY_OPEN, isOpen);
  }, [isOpen]);

  // Handle Escape key (mobile only)
  useEffect(() => {
    if (isDesktop) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, isDesktop]);

  // Body scroll lock when pane is open (mobile only)
  useEffect(() => {
    if (isDesktop) return;

    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen, isDesktop]);

  // Focus management (mobile only)
  useEffect(() => {
    if (isDesktop) return;

    if (isOpen && paneRef.current) {
      // Focus first focusable element in pane
      const firstFocusable = paneRef.current.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      setTimeout(() => firstFocusable?.focus(), 50);
    }
  }, [isOpen, isDesktop]);

  useEffect(() => {
    if (isDesktop) return;

    if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen, isDesktop]);

  // Focus trap when pane is open (mobile only)
  useEffect(() => {
    if (isDesktop) return;
    if (!isOpen || !paneRef.current) return;

    const pane = paneRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = pane.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    pane.addEventListener('keydown', handleKeyDown);
    return () => pane.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDesktop]);

  // Resize handlers (desktop only)
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (!isDesktop) return;
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = width;
  }, [isDesktop, width]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Resize from left edge, so dragging left increases width
      const delta = resizeStartX.current - e.clientX;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, resizeStartWidth.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth]);

  // Touch handlers for swipe gesture (mobile only) - swipe right to close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isDesktop) return;
    setTouchStart(e.touches[0].clientX);
    setTouchStartTime(Date.now());
    setIsDragging(true);
  }, [isDesktop]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDesktop) return;
    if (touchStart === null || !isDragging) return;

    const currentX = e.touches[0].clientX;
    const delta = currentX - touchStart;

    // Only allow swiping right (positive delta) to close
    if (delta > 0) {
      setTouchDelta(delta);
    }
  }, [touchStart, isDragging, isDesktop]);

  const handleTouchEnd = useCallback(() => {
    if (isDesktop) return;
    if (touchStart === null || !isDragging) return;

    const elapsed = Date.now() - touchStartTime;
    const velocity = Math.abs(touchDelta) / elapsed;

    if (Math.abs(touchDelta) > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      onClose();
    }

    setTouchStart(null);
    setTouchDelta(0);
    setIsDragging(false);
  }, [touchStart, touchDelta, touchStartTime, isDragging, onClose, isDesktop]);

  const getPaneTransform = () => {
    if (isDragging && touchDelta > 0) {
      const dragOffset = Math.min(touchDelta, 320);
      return `translateX(${dragOffset}px)`;
    }
    return undefined;
  };

  // Desktop layout: persistent pane that slides in/out with resize handle
  if (isDesktop) {
    return (
      <aside
        ref={paneRef}
        id="right-pane"
        role="complementary"
        aria-label="Team chat"
        className={`
          flex-shrink-0 h-full bg-bg-secondary border-l border-border
          transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          overflow-hidden relative
          ${isOpen ? '' : 'w-0'}
          ${isResizing ? 'select-none' : ''}
        `}
        style={{ width: isOpen ? width : 0 }}
      >
        {/* Resize Handle */}
        <div
          className={`
            absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize
            hover:bg-orange/30 active:bg-orange/50
            transition-colors duration-150
            ${isResizing ? 'bg-orange/50' : ''}
          `}
          onMouseDown={handleResizeStart}
          aria-label="Resize pane"
        />

        <div className="flex flex-col h-full" style={{ width }}>
          {children}
        </div>
      </aside>
    );
  }

  // Mobile layout: overlay with backdrop (slides from right)
  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 z-40
          bg-black/70 backdrop-blur-sm
          transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          lg:hidden
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Pane Panel */}
      <aside
        ref={paneRef}
        id="right-pane"
        role="complementary"
        aria-label="Team chat"
        className={`
          fixed inset-y-0 right-0 z-50
          w-[320px]
          bg-bg-secondary border-l border-border
          shadow-[-4px_0_20px_rgba(0,0,0,0.3)]
          transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          lg:hidden
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
          will-change-transform
        `}
        style={{
          transform: isDragging && touchDelta > 0 ? getPaneTransform() : undefined,
          transition: isDragging ? 'none' : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pane content container - identical to desktop */}
        <div className="flex flex-col h-full">
          {children}
        </div>
      </aside>
    </>
  );
}
