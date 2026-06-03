import React from 'react';

/**
 * SidebarToggleContext — shared between the property layout and child screens.
 * Child screens (e.g., dashboard) can call toggleSidebar() to open/close the
 * capability-filtered sidebar that lives in the layout.
 */
export const SidebarToggleContext = React.createContext<(() => void) | null>(null);

export function useSidebarToggle(): (() => void) | null {
  return React.useContext(SidebarToggleContext);
}
