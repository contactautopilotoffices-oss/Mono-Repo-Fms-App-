import React from 'react';
import { Redirect, useGlobalSearchParams } from 'expo-router';

export default function LegacyPropertyAdminDashboard() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  return <Redirect href={`/property/${propertyId}/lovable-admin`} />;
}
