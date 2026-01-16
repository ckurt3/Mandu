import { useCallback, useEffect, useRef, useState } from 'react';

interface SlideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onToggle: () => void;
  children: React.ReactNode;
}

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

export function SlideMenu({ isOpen, onClose, onOpen, onToggle, children }: SlideMenuProps) {
  const isDesktop = useIsDesktop();

  // Refs for focus management
  const menuRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Touch/swipe state (mobile only)
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Swipe thresholds
  const SWIPE_THRESHOLD = 100;
  const VELOCITY_THRESHOLD = 0.3;

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

  // Body scroll lock when menu is open (mobile only)
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

    if (isOpen && menuRef.current) {
      // Focus first focusable element in menu
      const firstFocusable = menuRef.current.querySelector(
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

  // Focus trap when menu is open (mobile only)
  useEffect(() => {
    if (isDesktop) return;
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
  }, [isOpen, isDesktop]);

  // Touch handlers for swipe gesture (mobile only)
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

    if (delta < 0) {
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

  const getMenuTransform = () => {
    if (isDragging && touchDelta < 0) {
      const dragOffset = Math.max(touchDelta, -320);
      return `translateX(${dragOffset}px)`;
    }
    return undefined;
  };

  // Desktop layout: persistent sidebar that slides in/out
  if (isDesktop) {
    return (
      <nav
        ref={menuRef}
        id="main-navigation"
        role="navigation"
        aria-label="Main navigation"
        className={`
          flex-shrink-0 h-full bg-bg-secondary border-r border-border
          transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          overflow-hidden
          ${isOpen ? 'w-[300px]' : 'w-0'}
        `}
      >
        <div className="flex flex-col h-full w-[300px]">
          {children}
        </div>
      </nav>
    );
  }

  // Mobile layout: overlay with backdrop
  return (
    <>
      {/* Hamburger Button - visible when menu is closed on mobile */}
      <button
        ref={triggerRef}
        className={`
          fixed top-3 left-4 z-30
          w-10 h-10 flex items-center justify-center
          bg-bg-secondary border border-border rounded-xl
          text-orange hover:bg-bg-hover hover:border-orange/30
          transition-all duration-200 shadow-soft
          lg:hidden
          ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
        onClick={onOpen}
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
        aria-controls="main-navigation"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

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

      {/* Menu Panel */}
      <nav
        ref={menuRef}
        id="main-navigation"
        role="navigation"
        aria-label="Main navigation"
        className={`
          fixed inset-y-0 left-0 z-50
          w-[300px]
          bg-bg-secondary border-r border-border
          shadow-[4px_0_20px_rgba(0,0,0,0.3)]
          transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          lg:hidden
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
        {/* Menu content container - identical to desktop */}
        <div className="flex flex-col h-full">
          {children}
        </div>
      </nav>
    </>
  );
}
