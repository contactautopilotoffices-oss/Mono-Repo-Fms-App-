/**
 * SidebarToggleContext — shared between the property layout and child screens.
 * Child screens (e.g., dashboard) can call toggleSidebar() to open/close the
 * capability-filtered sidebar that lives in the layout.
 *
 * NOTE: This file is DEPRECATED. Import from:
 *   '@/app/property/[propertyId]/_layout'
 * which has the single source of truth for the sidebar toggle.
 */

// Re-export from the single source of truth
export { SidebarToggleContext, useSidebarToggle } from '@/app/property/[propertyId]/_layout';
