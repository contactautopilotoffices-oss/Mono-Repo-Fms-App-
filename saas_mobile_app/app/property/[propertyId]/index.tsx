// @ts-nocheck
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Redirect, useGlobalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { LinearGradient } from 'expo-linear-gradient';
import DashboardSkeleton from '@/components/dashboard/lovable/SkeletonLoader';
import WeatherBackground from '@/components/dashboard/WeatherBackground';

import DashboardScreen from './dashboard/index';

// All roles now use the unified sidebar dashboard with capability-based module filtering.
export default function PropertyIndex() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const { user, membership, isLoading, isMembershipLoading } = useAuth();

  // CRITICAL: Wait for BOTH auth and membership loading to finish before
  // deciding where to redirect. Otherwise we flash login on every reopen
  // when membership cache has expired.
  if (isLoading || isMembershipLoading || (user && !membership)) {
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient
          colors={['#1c2135', '#0f121e', '#07090e']}
          style={StyleSheet.absoluteFillObject}
        />
        <WeatherBackground condition={undefined} />
        <DashboardSkeleton />
      </View>
    );
  }

  if (!propertyId) {
    return <Redirect href="/" />;
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  // Role-based dashboard routing
  const propMembership = membership?.properties?.find(
    (p) => p.id.toLowerCase() === propertyId.toLowerCase()
  );
  const propRole = propMembership?.role?.trim()?.toLowerCase();
  const orgRole = (membership?.org_role ?? '').trim().toLowerCase();

  const isTenant = ['tenant', 'super_tenant'].includes(propRole ?? '');
  const isProcurement = propRole === 'procurement' || orgRole === 'procurement';
  const isSecurity = propRole === 'security';

  // Lovable test dashboards — email-gated override
  const userEmail = user.email?.toLowerCase() ?? '';
  if (userEmail === 'srustikarta2022@gmail.com') {
    return <Redirect href={`/property/${propertyId}/lovable-mst`} />;
  }

  if (isTenant) {
    return <Redirect href={`/property/${propertyId}/tenant`} />;
  }

  if (isProcurement) {
    return <Redirect href={`/property/${propertyId}/procurement`} />;
  }

  if (isSecurity) {
    return <Redirect href={`/property/${propertyId}/security`} />;
  }

  // Render DashboardScreen directly for instant load without redirect delay
  return <DashboardScreen />;
}
