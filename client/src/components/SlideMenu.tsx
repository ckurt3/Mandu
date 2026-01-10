import { useCallback, useEffect, useRef, useState } from 'react';

interface SlideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  children: React.ReactNode;
}

export function SlideMenu({ isOpen, onClose, onOpen, children }: SlideMenuProps) {
  // Refs for focus management
  const menuRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Touch/swipe state
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Swipe thresholds
  const SWIPE_THRESHOLD = 100; // pixels
  const VELOCITY_THRESHOLD = 0.3; // pixels/ms

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);


  // Body scroll lock when menu is open
  useEffect(() => {
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
  }, [isOpen]);

  // Focus management - move focus to close button when menu opens
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      // Small delay to ensure animation has started
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Return focus to trigger when menu closes
  useEffect(() => {
    if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen]);

  // Focus trap when menu is open
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = menu.querySelectorAll(
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

    menu.addEventListener('keydown', handleKeyDown);
    return () => menu.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Touch handlers for swipe gesture
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
    setTouchStartTime(Date.now());
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStart === null || !isDragging) return;

    const currentX = e.touches[0].clientX;
    const delta = currentX - touchStart;

    // Only track leftward swipes (negative delta)
    if (delta < 0) {
      setTouchDelta(delta);
    }
  }, [touchStart, isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (touchStart === null || !isDragging) return;

    const elapsed = Date.now() - touchStartTime;
    const velocity = Math.abs(touchDelta) / elapsed;

    // Close if threshold exceeded OR fast swipe
    if (Math.abs(touchDelta) > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      onClose();
    }

    // Reset touch state
    setTouchStart(null);
    setTouchDelta(0);
    setIsDragging(false);
  }, [touchStart, touchDelta, touchStartTime, isDragging, onClose]);

  // Calculate transform style for swipe gesture
  const getMenuTransform = () => {
    if (isDragging && touchDelta < 0) {
      // Cap the drag distance at menu width
      const dragOffset = Math.max(touchDelta, -320);
      return `translateX(${dragOffset}px)`;
    }
    return undefined;
  };

  return (
    <>
      {/* Hamburger Button - visible when menu is closed */}
      <button
        ref={triggerRef}
        className={`
          fixed top-3 left-5 z-30
          w-11 h-11 flex items-center justify-center
          bg-bg-secondary border border-border rounded-xl
          text-orange hover:bg-bg-hover hover:border-orange/30
          transition-all duration-200 shadow-soft
          ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
        onClick={onOpen}
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
        aria-controls="main-navigation"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 z-40
          bg-black/70 backdrop-blur-sm
          transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Menu Panel */}
      <nav
        ref={menuRef}
        id="main-navigation"
        role="navigation"
        aria-label="Main navigation"
        className={`
          fixed inset-y-0 left-0 z-50
          w-[85vw] max-w-[320px]
          bg-bg-secondary border-r border-border
          shadow-[4px_0_20px_rgba(0,0,0,0.3)]
          transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          will-change-transform
        `}
        style={{
          transform: isDragging && touchDelta < 0 ? getMenuTransform() : undefined,
          transition: isDragging ? 'none' : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Close button - inside menu */}
        <button
          ref={closeButtonRef}
          className="
            absolute top-4 right-4 z-10
            w-8 h-8 flex items-center justify-center
            text-text-muted hover:text-text-primary hover:bg-bg-hover
            rounded-lg transition-all
          "
          onClick={onClose}
          aria-label="Close navigation menu"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Menu content container */}
        <div className="flex flex-col h-full">
          {children}
        </div>
      </nav>
    </>
  );
}
