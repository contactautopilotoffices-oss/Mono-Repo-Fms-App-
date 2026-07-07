import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { View, Text, TouchableOpacity } from 'react-native';
import { useEffect } from 'react';
import SkeletonLoader from '@/components/dashboard/lovable/SkeletonLoader';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

export default function Index() {
  const { user, isLoading, membership, isMembershipLoading, signOut } = useAuth();

  useEffect(() => {
    if (__DEV__) {
      console.log('[Index] isLoading:', isLoading, 'isMembershipLoading:', isMembershipLoading, 'user:', user?.email, 'membership:', membership?.properties?.length);
    }
  }, [isLoading, isMembershipLoading, user, membership]);

  // Wait for both Auth and Membership to finish loading
  if (isLoading || isMembershipLoading) {
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient
          colors={['#1c2135', '#0f121e', '#07090e']}
          style={StyleSheet.absoluteFillObject}
        />
        <WeatherBackground condition={undefined} />
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
      <View style={{ flex: 1 }}>
        <LinearGradient
          colors={['#1c2135', '#0f121e', '#07090e']}
          style={StyleSheet.absoluteFillObject}
        />
        <WeatherBackground condition={undefined} />
        <SkeletonLoader />
      </View>
    );
  }

  // Route org super admin to the Lovable Super Admin Dashboard
  if (membership.org_role === 'org_super_admin') {
    return <Redirect href="/super-admin" />;
  }

  // super_tenant org role — show property selector with all their assigned properties
  if (membership.org_role === 'super_tenant') {
    // Redirect to the first property's dashboard which will render the SuperTenantPropertySelector
    if (membership.properties && membership.properties.length > 0) {
      const firstProperty = membership.properties[0];
      return <Redirect href={`/property/${firstProperty.id}/dashboard`} />;
    }
  }

  // User is authenticated — redirect directly to first property dashboard
  if (membership.properties && membership.properties.length > 0) {
    const isPropertyAdminOnAny = membership.properties.some(p => 
      ['property_admin', 'admin', 'manager', 'property_manager', 'facility_manager'].includes(p.role?.toLowerCase() || '')
    );
    
    // If they have multiple properties and are admin on at least one, go to property selector
    if (membership.properties.length > 1 && isPropertyAdminOnAny) {
      return <Redirect href="/super-admin" />;
    }

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

  // If the user has not completed onboarding, send them to the onboarding flow
  if (user?.user_metadata?.onboarding_completed === false || user?.user_metadata?.onboarding_completed === undefined) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  // User is authenticated but has no property access and has completed onboarding
  // (they may need to be invited, but we shouldn't log them out)
  return (
    <View style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
        No Properties Assigned
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
        You don't have access to any properties yet. Contact your administrator.
      </Text>
      <TouchableOpacity 
        onPress={() => signOut()}
        style={{ paddingVertical: 12, paddingHorizontal: 24, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 }}
      >
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}
