import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { View, Text } from 'react-native';
import { useEffect } from 'react';
import SkeletonLoader from '@/components/dashboard/lovable/SkeletonLoader';

export default function Index() {
  const { user, isLoading, membership, isMembershipLoading } = useAuth();

  useEffect(() => {
    if (__DEV__) {
      console.log('[Index] isLoading:', isLoading, 'isMembershipLoading:', isMembershipLoading, 'user:', user?.email, 'membership:', membership?.properties?.length);
    }
  }, [isLoading, isMembershipLoading, user, membership]);

  // Wait for both Auth and Membership to finish loading
  if (isLoading || isMembershipLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
        <SkeletonLoader />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  // Super Admin — master admin check
  if (user?.user_metadata?.is_master_admin || user?.email?.toLowerCase() === 'sanyog@gmail.com') {
    return <Redirect href="/super-admin" />;
  }

  // If user is authenticated but membership is still loading, keep showing loader
  // instead of redirecting to login. This prevents the login-flash bug when
  // membership cache expires or fetch is slow.
  if (!membership) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
        <SkeletonLoader />
      </View>
    );
  }

  // Route org super admin to the Lovable Super Admin Dashboard
  if (membership.org_role === 'org_super_admin') {
    return <Redirect href="/super-admin" />;
  }

  // User is authenticated — redirect directly to first property dashboard
  if (membership.properties && membership.properties.length > 0) {
    const firstProperty = membership.properties[0];
    if (__DEV__) {
      console.log('[Index] Redirecting to property:', firstProperty.id, firstProperty.name);
    }
    return <Redirect href={`/property/${firstProperty.id}`} />;
  }

  // Org-level admin with no property memberships yet — show "Select Property" instead of an error
  // This handles new super admins who have org_memberships but no property_memberships yet
  if (membership.org_id && membership.org_role) {
    return <Redirect href="/(auth)/property-selection" />;
  }

  // User is authenticated but has no property access — show loading instead of login
  // (they may need to be invited, but we shouldn't log them out)
  return (
    <View style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
        No Properties Assigned
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center' }}>
        You don't have access to any properties yet. Contact your administrator.
      </Text>
    </View>
  );
}
