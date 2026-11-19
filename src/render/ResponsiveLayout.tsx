/**
 * Responsive layout component (plan phase 4.5).
 *
 * Implements responsive layout per DESIGN.md: rails become a bottom sheet
 * under 720px, stack under the stage under 1120px, three-zone grid above.
 * Test at 360×640, 390×844, 768×1024.
 */

import { useState, useEffect, type ReactNode } from 'react';

/** Below this width the rails become a bottom sheet (DESIGN.md). */
export const BREAKPOINT_MOBILE = 720;
/** Below this width the rails stack under the stage (DESIGN.md). */
export const BREAKPOINT_TABLET = 1120;

export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

/** Single source of truth for the responsive mode of a viewport width. */
export function classifyWidth(width: number): LayoutMode {
  if (width < BREAKPOINT_MOBILE) return 'mobile';
  if (width < BREAKPOINT_TABLET) return 'tablet';
  return 'desktop';
}

interface ResponsiveLayoutProps {
  /** Source rail content */
  sourceRail: ReactNode;
  /** Stage content (main canvas area) */
  stage: ReactNode;
  /** Look rail content */
  lookRail: ReactNode;
  /** Transport bar content */
  transport: ReactNode;
  /** Children content */
  children?: ReactNode;
}

export function ResponsiveLayout({
  sourceRail,
  stage,
  lookRail,
  transport,
  children,
}: ResponsiveLayoutProps) {
  const { isMobile, isTablet } = useResponsive();

  // Layout classes based on screen size
  const layoutClasses = `responsive-layout ${
    isMobile ? 'mobile-layout' : isTablet ? 'tablet-layout' : 'desktop-layout'
  }`;

  // Rail classes based on screen size
  const railClasses = `rails-container ${
    isMobile ? 'mobile-rails' : isTablet ? 'tablet-rails' : 'desktop-rails'
  }`;

  // Transport classes based on screen size
  const transportClasses = `transport-bar ${isMobile ? 'mobile-transport' : 'desktop-transport'}`;

  return (
    <div className={layoutClasses}>
      {/* Main content area */}
      <div className="main-content">
        {/* Stage - always visible and takes center stage */}
        <div className="stage">{stage}</div>

        {/* Children content (if any) */}
        {children && <div className="children">{children}</div>}
      </div>

      {/* Rails container - position changes based on screen size */}
      <div className={railClasses}>
        {/* Desktop layout: three-zone grid */}
        {!isMobile && (
          <>
            <div className="source-rail">{sourceRail}</div>
            <div className="look-rail">{lookRail}</div>
          </>
        )}

        {/* Mobile layout: bottom sheet with tabs */}
        {isMobile && (
          <div className="mobile-rails-sheet">
            <div className="rail-tabs">
              <button className="rail-tab active" data-rail="source">
                Source
              </button>
              <button className="rail-tab" data-rail="look">
                Look
              </button>
            </div>
            <div className="rail-content active" data-rail-content="source">
              {sourceRail}
            </div>
            <div className="rail-content" data-rail-content="look">
              {lookRail}
            </div>
          </div>
        )}

        {/* Tablet layout: stacked rails */}
        {isTablet && (
          <>
            <div className="stacked-rail">
              <div className="rail-header">Source</div>
              {sourceRail}
            </div>
            <div className="stacked-rail">
              <div className="rail-header">Look</div>
              {lookRail}
            </div>
          </>
        )}
      </div>

      {/* Transport bar - position changes based on screen size */}
      <div className={transportClasses}>{transport}</div>

      {/* Mobile rail toggle button (only visible on mobile) */}
      {isMobile && (
        <button className="rail-toggle" aria-label="Toggle rails">
          <span className="icon">☰</span>
        </button>
      )}
    </div>
  );
}

// Hook for detecting screen size
export function useResponsive() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Return responsive breakpoints
  const mode = classifyWidth(windowSize.width);
  return {
    width: windowSize.width,
    height: windowSize.height,
    mode,
    isMobile: mode === 'mobile',
    isTablet: mode === 'tablet',
    isDesktop: mode === 'desktop',
    // Specific test sizes mentioned in the plan
    is360x640: windowSize.width === 360 && windowSize.height === 640,
    is390x844: windowSize.width === 390 && windowSize.height === 844,
    is768x1024: windowSize.width === 768 && windowSize.height === 1024,
  };
}

// Component for testing specific screen sizes
interface ResponsiveTestProps {
  children: (breakpoint: string) => ReactNode;
}

export function ResponsiveTest({ children }: ResponsiveTestProps) {
  const responsive = useResponsive();

  let breakpoint = 'desktop';
  if (responsive.is360x640) breakpoint = '360x640';
  else if (responsive.is390x844) breakpoint = '390x844';
  else if (responsive.is768x1024) breakpoint = '768x1024';
  else if (responsive.isMobile) breakpoint = 'mobile';
  else if (responsive.isTablet) breakpoint = 'tablet';

  return <>{children(breakpoint)}</>;
}
