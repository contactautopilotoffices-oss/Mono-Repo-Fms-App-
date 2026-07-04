'use client';

import React, { useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useGlobalSearchParams, Redirect, usePathname } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

// ─── Role-based Dashboard imports ─────────────────────────────────────────────
import LovableMstDashboard from '@/components/dashboard/LovableMstDashboard';

import LovablePropertyAdminDashboard from '@/components/dashboard/LovablePropertyAdminDashboard';
import SecurityDashboard from '@/components/dashboard/SecurityDashboard';
import LovableSoftServiceManagerDashboard from '@/components/dashboard/LovableSoftServiceManagerDashboard';
import LovableStaffDashboard from '@/components/dashboard/LovableStaffDashboard';
import SuperTenantPropertySelector from '@/components/dashboard/SuperTenantPropertySelector';
import SkeletonLoader from '@/components/dashboard/lovable/SkeletonLoader';
import FoodVendorDashboard from '@/components/dashboard/FoodVendorDashboard';

// ─── Role constants ────────────────────────────────────────────────────────────

const MST_ROLES = ['master_admin', 'mst', 'super_admin'];
const ORG_ADMIN_ROLES = ['org_super_admin', 'org_admin', 'owner'];
const PROPERTY_ADMIN_ROLES = ['property_admin', 'admin', 'manager', 'property_manager', 'facility_manager', 'spoc', 'administrator'];
const SECURITY_ROLES = ['security', 'security_guard', 'guard'];
const SOFT_SERVICE_ROLES = ['soft_service_manager', 'soft_services', 'housekeeping_manager'];
const STAFF_ROLES = ['staff', 'maintenance_staff', 'technician', 'helper', 'cleaner'];
const TENANT_ROLES = ['tenant'];
const SUPER_TENANT_ROLES = ['super_tenant'];
const VENDOR_ROLES = ['vendor', 'food_vendor'];

export default function DashboardScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const pathname = usePathname();
  
  // TEMPORARY LOGGING
  React.useEffect(() => {
    console.log(`[Phase 1 Debug] Dashboard Index Rendered | Dashboard PropertyId: ${propertyId} | Route URL: ${pathname}`);
  }, [propertyId, pathname]);

  const { membership, isMembershipLoading, user } = useAuth();

  // Determine the user's effective role for this property
  const effectiveRole = useMemo(() => {
    if (!membership) return null;

    // 1. Check org-level role first (org_role overrides property role for MST/Org Admin)
    const orgRole = (membership.org_role || '').toLowerCase();
    if (MST_ROLES.includes(orgRole)) return 'mst';
    if (ORG_ADMIN_ROLES.includes(orgRole)) return 'org_admin';

    // 2. Handle "all" properties view
    if (propertyId === 'all') {
      const isPropAdminOrHigher = membership.properties.some(p => 
        PROPERTY_ADMIN_ROLES.includes((p.role || '').toLowerCase()) || 
        ORG_ADMIN_ROLES.includes((p.role || '').toLowerCase())
      );
      if (isPropAdminOrHigher) return 'property_admin';
      return 'staff'; // Fallback if they somehow reached here without admin rights
    }

    // 3. Check property-level role
    const prop = membership.properties.find((p) => p.id === propertyId);
    const propRole = (prop?.role || '').toLowerCase();

    if (MST_ROLES.includes(propRole)) return 'mst';
    if (ORG_ADMIN_ROLES.includes(propRole)) return 'org_admin';
    if (PROPERTY_ADMIN_ROLES.includes(propRole)) return 'property_admin';
    if (SECURITY_ROLES.includes(propRole)) return 'security';
    if (SOFT_SERVICE_ROLES.includes(propRole)) return 'soft_service';
    if (propRole === 'super_tenant') return 'super_tenant';
    if (TENANT_ROLES.includes(propRole)) return 'tenant';
    if (VENDOR_ROLES.includes(propRole)) return 'vendor';
    if (STAFF_ROLES.includes(propRole)) return 'staff';

    if (propRole === 'procurement' || orgRole === 'procurement') return 'procurement';

    // 3. Default to staff
    return propRole || 'staff';
  }, [membership, propertyId]);

  if (isMembershipLoading) {
    return (
      <View style={[styles.loader, { backgroundColor: '#121212' }]}>
        <SkeletonLoader />
      </View>
    );
  }

  // If membership is null after loading (e.g., network error), redirect to root to handle it
  if (!membership) {
    return <Redirect href="/" />;
  }

  const pid = propertyId ?? '';

  // ─── Role-based render ────────────────────────────────────────────────────
  if (effectiveRole === 'procurement') {
    return <Redirect href={`/property/${pid}/procurement`} />;
  }

  // super_tenant: show property selector (not a redirect, a full screen)
  if (effectiveRole === 'super_tenant') {
    return <SuperTenantPropertySelector />;
  }

  if (effectiveRole === 'tenant') {
    return <Redirect href={`/property/${pid}/tenant`} />;
  }

  if (effectiveRole === 'mst') {
    return <LovableMstDashboard propertyId={pid} />;
  }

  if (effectiveRole === 'org_admin') {
    return <LovablePropertyAdminDashboard propertyId={pid} />;
  }

  if (effectiveRole === 'security') {
    return <SecurityDashboard propertyId={pid} />;
  }

  if (effectiveRole === 'soft_service') {
    return <LovableSoftServiceManagerDashboard propertyId={pid} />;
  }

  if (effectiveRole === 'staff') {
    return <LovableStaffDashboard propertyId={pid} />;
  }

  if (effectiveRole === 'vendor') {
    return <FoodVendorDashboard propertyId={pid} />;
  }

  // property_admin, tenant, vendor, and any other role → property admin dashboard
  if (effectiveRole === 'property_admin') {
    return <LovablePropertyAdminDashboard propertyId={pid} />;
  }

  // Any other role (including staff, technician, unhandled roles) defaults to the staff dashboard
  return <LovableStaffDashboard propertyId={pid} />;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
});
