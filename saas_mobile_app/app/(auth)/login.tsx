// @ts-nocheck
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Dimensions,
  Image,
} from 'react-native';

// ─── Lovable Dashboard Font Stack ────────────────────────────────────────────
const FONT_FAMILY = Platform.select({
  web: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

const FONT_TRACKING = {
  display: -0.04 * 16,  // -0.04em
  body: -0.01 * 16,     // -0.01em
  tight: -0.02 * 16,    // -0.02em
};
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/utils/api/mobileApi';
import { authService } from '@/services/authService';
import { supabase } from '@/utils/supabase/client';
import { Colors } from '@/constants/Colors';
import { AutopilotLogo, AutopilotIcon } from '@/components/ui/AutopilotLogo';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolateColor,
  interpolate,
} from 'react-native-reanimated';

// ─── Zod schema ───────────────────────────────────────────────────────────────
const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const signUpSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type SignInForm = z.infer<typeof signInSchema>;
type SignUpForm = z.infer<typeof signUpSchema>;

type AuthMode = 'signin' | 'signup';

const { width: SCREEN_W } = Dimensions.get('window');

WebBrowser.maybeCompleteAuthSession();

// ─── Background Slideshow ──────────────────────────────────────────────────────
const SLIDE_INTERVAL = 5000;
const BACKGROUND_IMAGES = [
  require('../../assets/images/ss_plaza.jpg'),
  require('../../assets/images/etpl_digitide.png'),
  require('../../assets/images/rabale.png'),
];

function BackgroundSlideshow() {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const opacity0 = useSharedValue(1);
  const opacity1 = useSharedValue(0);
  const opacity2 = useSharedValue(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % BACKGROUND_IMAGES.length);
    }, SLIDE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    opacity0.value = withTiming(currentIndex === 0 ? 1 : 0, { duration: 1000 });
    opacity1.value = withTiming(currentIndex === 1 ? 1 : 0, { duration: 1000 });
    opacity2.value = withTiming(currentIndex === 2 ? 1 : 0, { duration: 1000 });
  }, [currentIndex]);

  const style0 = useAnimatedStyle(() => ({ opacity: opacity0.value }));
  const style1 = useAnimatedStyle(() => ({ opacity: opacity1.value }));
  const style2 = useAnimatedStyle(() => ({ opacity: opacity2.value }));

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '65%' }}>
      <Animated.Image 
        source={BACKGROUND_IMAGES[0]} 
        style={[{ width: '100%', height: '100%', position: 'absolute', resizeMode: 'cover' }, style0]} 
      />
      <Animated.Image 
        source={BACKGROUND_IMAGES[1]} 
        style={[{ width: '100%', height: '100%', position: 'absolute', resizeMode: 'cover' }, style1]} 
      />
      <Animated.Image 
        source={BACKGROUND_IMAGES[2]} 
        style={[{ width: '100%', height: '100%', position: 'absolute', resizeMode: 'cover' }, style2]} 
      />
      {/* Dark gradient overlay to make text readable */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />
    </View>
  );
}

const AnimatedIcon = Animated.createAnimatedComponent(Ionicons);

const AnimatedInput = ({ 
  iconName, 
  placeholder, 
  value, 
  onChangeText, 
  onBlur, 
  secureTextEntry,
  hasError, 
  onEyePress, 
  showEyeIcon,
  isEyeOff,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  theme,
  isDark
}: any) => {
  const [isFocused, setIsFocused] = useState(false);
  const focusAnim = useSharedValue(0);

  React.useEffect(() => {
    focusAnim.value = withTiming(isFocused ? 1 : 0, { duration: 200, easing: Easing.inOut(Easing.ease) });
  }, [isFocused]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    const borderWidth = interpolate(focusAnim.value, [0, 1], [1, 1.5]);
    
    return {
      borderColor: hasError 
        ? theme.error 
        : (focusAnim.value > 0.5 ? '#9FC4D0' : 'rgba(255,255,255,0.08)'),
      borderWidth,
      backgroundColor: isDark ? '#2A2A2A' : '#F3F4F6'
    };
  });

  const animatedIconProps = useAnimatedProps(() => {
    return { 
      color: focusAnim.value > 0.5 ? '#9FC4D0' : '#A5A5A5' 
    };
  });

  return (
    <Animated.View style={[styles.inputContainer, animatedContainerStyle]}>
      <AnimatedIcon name={iconName} size={20} animatedProps={animatedIconProps} style={styles.inputIcon} />
      <TextInput
        style={[styles.input, { color: isDark ? '#FFFFFF' : '#111111' }]}
        placeholder={placeholder}
        placeholderTextColor={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => { setIsFocused(false); if (onBlur) onBlur(e); }}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
      />
      {showEyeIcon && (
        <TouchableOpacity onPress={onEyePress} style={styles.eyeButton}>
          <Ionicons name={isEyeOff ? 'eye-off-outline' : 'eye-outline'} size={20} color="#A5A5A5" />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const AnimatedToggle = ({ authMode, setAuthMode, onToggle, isDark }: any) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const positionAnim = useSharedValue(authMode === 'signin' ? 0 : 1);

  React.useEffect(() => {
    positionAnim.value = withTiming(authMode === 'signin' ? 0 : 1, { duration: 250, easing: Easing.inOut(Easing.ease) });
  }, [authMode]);

  const animatedBgStyle = useAnimatedStyle(() => {
    const tabWidth = (containerWidth - 8) / 2;
    return {
      width: tabWidth,
      backgroundColor: isDark ? '#2A2A2A' : '#FFFFFF',
      borderRadius: 8,
      transform: [{ translateX: positionAnim.value * tabWidth }]
    };
  });

  const signInTextStyle = useAnimatedStyle(() => ({
    color: positionAnim.value < 0.5 ? (isDark ? '#FFFFFF' : '#111111') : (isDark ? 'rgba(255,255,255,0.5)' : '#888888'),
  }));

  const signUpTextStyle = useAnimatedStyle(() => ({
    color: positionAnim.value < 0.5 ? (isDark ? 'rgba(255,255,255,0.5)' : '#888888') : (isDark ? '#FFFFFF' : '#111111'),
  }));

  return (
    <View style={styles.tabContainer} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      {containerWidth > 0 && <Animated.View style={[styles.activeTab, animatedBgStyle, { position: 'absolute', top: 4, bottom: 4, left: 4 }]} />}
      <TouchableOpacity style={styles.tab} onPress={() => { setAuthMode('signin'); onToggle(); }} activeOpacity={1}>
        <Animated.Text style={[styles.tabText, signInTextStyle, { fontWeight: authMode === 'signin' ? '700' : '500' }]}>Sign In</Animated.Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tab} onPress={() => { setAuthMode('signup'); onToggle(); }} activeOpacity={1}>
        <Animated.Text style={[styles.tabText, signUpTextStyle, { fontWeight: authMode === 'signup' ? '700' : '500' }]}>Sign Up</Animated.Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────
export default function LoginScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const isDark = colorScheme === 'dark';

  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiSuccess, setApiSuccess] = useState('');

  const { signIn, signUp } = useAuth();
  const router = useRouter();

  // ─── React Hook Form – Sign In ─────────────────────────────────────────────
  const signInForm = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onSubmit',
  });

  // ─── React Hook Form – Sign Up ──────────────────────────────────────────────
  const signUpForm = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
    mode: 'onSubmit',
  });

  const isSignInLoading = signInForm.formState.isSubmitting;
  const isSignUpLoading = signUpForm.formState.isSubmitting;

  // ─── Floating shapes config (theme-aware) ────────────────────────────────────
  const shapes = useMemo(
    () => [
      { size: 64, color: isDark ? 'rgba(112,143,150,0.12)' : 'rgba(112,143,150,0.10)', top: 60, left: -20, delay: 0, duration: 3500 },
      { size: 40, color: isDark ? 'rgba(41,151,255,0.10)' : 'rgba(41,151,255,0.08)', top: 140, right: 20, delay: 400, duration: 4000 },
      { size: 28, color: isDark ? 'rgba(112,143,150,0.15)' : 'rgba(112,143,150,0.12)', top: 240, left: 30, delay: 800, duration: 3200 },
      { size: 48, color: isDark ? 'rgba(255,159,10,0.08)' : 'rgba(255,159,10,0.06)', top: 360, right: -10, delay: 200, duration: 3800 },
      { size: 20, color: isDark ? 'rgba(52,199,89,0.10)' : 'rgba(52,199,89,0.08)', top: 480, left: '20%', delay: 600, duration: 3000 },
    ],
    [isDark]
  );

  // ─── Redirect helper ────────────────────────────────────────────────────────
  const resolveAndRedirect = async (authUserId: string) => {
    if (authUserId?.toLowerCase() === 'sanyog@gmail.com') {
      router.replace('/super-admin' as any);
      return;
    }

    // Fetch user profile via API - if not found, continue without it (new users)
    let profileRes;
    try {
      profileRes = await apiFetch<{ success: boolean; data: { id: string } | null }>(`/api/users/${authUserId}`);
    } catch {
      // User profile might not exist yet for new users - continue anyway
      profileRes = { success: true, data: null };
    }

    // Fetch organization memberships via API
    const orgMemRes = await apiFetch<{ success: boolean; data: Array<{ organization_id: string; role: string; is_active: boolean | null }> }>('/api/users/me/organization-memberships');
    const orgRows = orgMemRes.success ? orgMemRes.data ?? [] : [];

    const ORG_LEVEL_ROLES = ['org_super_admin', 'super_tenant', 'owner', 'admin', 'org_admin', 'maintenance_vendor'];
    const activeOrgMemberships = orgRows.filter(
      (m) => ORG_LEVEL_ROLES.includes(m.role) && (m.is_active === true || m.is_active === null)
    );

    if (activeOrgMemberships.length > 0) {
      const ORG_PRIORITY = ['org_super_admin', 'super_tenant', 'owner', 'admin', 'member'];
      const best = [...activeOrgMemberships].sort((a, b) => {
        const ai = ORG_PRIORITY.indexOf(a.role) === -1 ? 99 : ORG_PRIORITY.indexOf(a.role);
        const bi = ORG_PRIORITY.indexOf(b.role) === -1 ? 99 : ORG_PRIORITY.indexOf(b.role);
        return ai - bi;
      })[0];

      if (best.role === 'org_super_admin') {
        router.replace('/super-admin' as any);
        return;
      }

      // Fetch org properties via API
      const propsRes = await apiFetch<{ success: boolean; data: Array<{ id: string; name: string }> }>(`/api/organizations/${best.organization_id}/properties`);
      const orgProps = propsRes.success ? propsRes.data ?? [] : [];

      if (orgProps && orgProps.length === 1) {
        router.replace(`/property/${orgProps[0].id}` as any);
        return;
      }


      if (orgProps && orgProps.length > 0) {
        const propsParam = encodeURIComponent(JSON.stringify(orgProps.map((p) => ({
          id: p.id,
          role: best.role
        }))));
        router.replace(`/(auth)/property-selection?properties=${propsParam}`);
        return;
      } else {
        router.replace('/(auth)/property-selection');
        return;
      }
    }

    // Fetch property memberships via API
    const propMemRes = await apiFetch<{ success: boolean; data: Array<{ property_id: string; organization_id: string; role: string; is_active: boolean | null }> }>('/api/users/me/property-memberships');
    const propRows = propMemRes.success ? propMemRes.data ?? [] : [];

    const activePropMemberships = propRows.filter(
      (m) => m.is_active === true || m.is_active === null
    );

    if (activePropMemberships.length === 0) {
      router.replace('/onboarding' as any);
      return;
    }

    if (activePropMemberships.length === 1) {
      const { property_id: pId } = activePropMemberships[0];
      // Route through /property/[id] which handles role-based dashboard selection
      router.replace(`/property/${pId}`);
      return;
    }


    const isPropertyAdminOnAny = activePropMemberships.some(p => 
      ['property_admin', 'admin', 'manager', 'property_manager', 'facility_manager'].includes(p.role?.toLowerCase() || '')
    );
    
    if (isPropertyAdminOnAny) {
      router.replace('/super-admin' as any);
      return;
    }

    router.replace({
      pathname: '/(auth)/property-selection',
      params: {
        properties: JSON.stringify(activePropMemberships.map((m) => ({ id: m.property_id, role: m.role }))),
      },
    });
  };

  // ─── Handle Zoho Sign In ──────────────────────────────────────────────────
  const handleZohoSignIn = async () => {
    setApiError('');
    try {
      const apiUrl = process.env.EXPO_PUBLIC_MOBILE_SERVER_URL || 'http://localhost:3000';
      // MUST match the app/callback/index.tsx route so Expo Router catches it globally
      const redirectUrl = Linking.createURL('callback');
      
      const authUrl = `${apiUrl}/api/auth/zoho?redirect_to=${encodeURIComponent(redirectUrl)}`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl, { showInRecents: true });
      
      if (result.type === 'cancel') {
        throw new Error('Authentication was cancelled');
      }
      
      // Success case is handled by app/callback/index.tsx which receives the deep link automatically
    } catch (err: any) {
      setApiError(err.message || 'Zoho Login Failed');
    }
  };

  // ─── Handle Sign In ─────────────────────────────────────────────────────────
  const handleSignIn = async (values: SignInForm) => {
    setApiError('');
    setApiSuccess('');
    try {
      const { data: { user: authUser }, error: signInError } = await signIn(values.email, values.password);
      if (signInError || !authUser) throw new Error(signInError || 'Login failed');

      await resolveAndRedirect(authUser.id);
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('invalid login credentials')) {
        setApiError('Invalid email or password. Please check your credentials and try again.');
      } else if (msg.includes('email not confirmed')) {
        setApiError('Please verify your email address before signing in. Check your inbox for a verification link.');
      } else if (msg.includes('too many requests')) {
        setApiError('Too many login attempts. Please wait a few minutes before trying again.');
      } else if (msg.includes('network')) {
        setApiError('Network error. Please check your internet connection and try again.');
      } else {
        setApiError(err.message || 'Something went wrong. Please try again.');
      }
    }
  };

  // ─── Handle Sign Up ─────────────────────────────────────────────────────────
  const handleSignUp = async (values: SignUpForm) => {
    setApiError('');
    setApiSuccess('');
    try {
      const result = await signUp(values.email, values.password, values.fullName);
      if (result?.session) {
        router.replace('/onboarding' as any);
      } else if (result?.user) {
        setApiSuccess('Account created! Please check your email inbox to verify your account before logging in.');
        signUpForm.reset();
      } else {
        throw new Error('Signup failed to return user data.');
      }
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists')) {
        setApiError('An account with this email already exists. Try signing in instead.');
      } else if (msg.includes('too many requests')) {
        setApiError('Too many signup attempts. Please wait a few minutes before trying again.');
      } else {
        setApiError(err.message || 'Something went wrong. Please try again.');
      }
    }
  };

  // ─── Handle Google OAuth ────────────────────────────────────────────────────
  const handleGoogleAuth = async () => {
    setApiError('');
    try {
      const res = await authService.signInWithGoogle();
      if (res.error) throw new Error(res.error as any);
      // We don't fetch getUser() or resolveAndRedirect here.
      // The WebBrowser will close and the deep link (autopilot://callback) 
      // will be handled by app/callback/index.tsx which sets the session and redirects.
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('network')) {
        setApiError('Network error. Please check your internet connection and try again.');
      } else {
        setApiError(err.message || 'Google sign-in failed.');
      }
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* 1. Background Slideshow */}
      <BackgroundSlideshow />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        
        {/* 2. Top Section (Logo Only) */}
        <View style={styles.topSection}>
          <View style={styles.logoWrap}>
            <AutopilotLogo size={40} variant="light" />
          </View>
        </View>

        {/* 3. Bottom Sheet / Login Card */}
        <View style={styles.bottomSheetWrapper}>
          <View style={[styles.bottomSheet, { backgroundColor: theme.surface }]}>
            
            <View style={[styles.floatingIconContainer, { backgroundColor: theme.surface }]}>
            <Image 
              source={require('@/assets/images/notification-icon.png')}
              style={{ width: 32, height: 32, resizeMode: 'contain' }}
            />
          </View>
            
            {/* Heading */}
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              {authMode === 'signup' ? 'Create ' : 'Welcome '}
              <Text style={{ color: theme.primary }}>{authMode === 'signup' ? 'Account' : 'Back!'}</Text>
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {authMode === 'signup'
                ? 'Get started with your facility management hub and manage everything in one place.'
                : 'Sign in to your facility management hub and manage everything in one place.'}
            </Text>

            {/* Tab Switcher */}
            <View style={[styles.tabContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
              <TouchableOpacity
                style={[styles.tab, authMode === 'signin' && [styles.activeTab, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF' }]]}
                onPress={() => { setAuthMode('signin'); setApiError(''); setApiSuccess(''); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, { color: authMode === 'signin' ? theme.primary : theme.textTertiary }]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, authMode === 'signup' && [styles.activeTab, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF' }]]}
                onPress={() => { setAuthMode('signup'); setApiError(''); setApiSuccess(''); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, { color: authMode === 'signup' ? theme.primary : theme.textTertiary }]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View style={styles.form}>
              
              {authMode === 'signin' ? (
                <>
                  {/* Sign In Email */}
                  <Controller
                    key="signin-email"
                    control={signInForm.control}
                    name="email"
                    render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                      <View style={{ gap: 4 }}>
                        <AnimatedInput
                          iconName="mail-outline"
                          placeholder="name@company.com"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          hasError={!!error}
                          theme={theme}
                          isDark={isDark}
                        />
                        {error && <Text style={{ color: theme.error, fontSize: 12, marginLeft: 8 }}>{error.message}</Text>}
                      </View>
                    )}
                  />

                  {/* Sign In Password */}
                  <Controller
                    key="signin-password"
                    control={signInForm.control}
                    name="password"
                    render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                      <View style={{ gap: 4 }}>
                        <AnimatedInput
                          iconName="lock-closed-outline"
                          placeholder="Password"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          secureTextEntry={!showPassword}
                          hasError={!!error}
                          theme={theme}
                          isDark={isDark}
                          showEyeIcon={true}
                          isEyeOff={showPassword}
                          onEyePress={() => setShowPassword(!showPassword)}
                        />
                        {error && <Text style={{ color: theme.error, fontSize: 12, marginLeft: 8 }}>{error.message}</Text>}
                      </View>
                    )}
                  />
                </>
              ) : (
                <>
                  {/* Sign Up Full Name */}
                  <Controller
                    key="signup-fullname"
                    control={signUpForm.control}
                    name="fullName"
                    render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                      <View style={{ gap: 4 }}>
                        <AnimatedInput
                          iconName="person-outline"
                          placeholder="John Doe"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          autoCapitalize="words"
                          hasError={!!error}
                          theme={theme}
                          isDark={isDark}
                        />
                        {error && <Text style={{ color: theme.error, fontSize: 12, marginLeft: 8 }}>{error.message}</Text>}
                      </View>
                    )}
                  />

                  {/* Sign Up Email */}
                  <Controller
                    key="signup-email"
                    control={signUpForm.control}
                    name="email"
                    render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                      <View style={{ gap: 4 }}>
                        <AnimatedInput
                          iconName="mail-outline"
                          placeholder="name@company.com"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          hasError={!!error}
                          theme={theme}
                          isDark={isDark}
                        />
                        {error && <Text style={{ color: theme.error, fontSize: 12, marginLeft: 8 }}>{error.message}</Text>}
                      </View>
                    )}
                  />

                  {/* Sign Up Password */}
                  <Controller
                    key="signup-password"
                    control={signUpForm.control}
                    name="password"
                    render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                      <View style={{ gap: 4 }}>
                        <AnimatedInput
                          iconName="lock-closed-outline"
                          placeholder="Password"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          secureTextEntry={!showPassword}
                          hasError={!!error}
                          theme={theme}
                          isDark={isDark}
                          showEyeIcon={true}
                          isEyeOff={showPassword}
                          onEyePress={() => setShowPassword(!showPassword)}
                        />
                        {error && <Text style={{ color: theme.error, fontSize: 12, marginLeft: 8 }}>{error.message}</Text>}
                      </View>
                    )}
                  />

                  {/* Sign Up Confirm Password */}
                  <Controller
                    key="signup-confirmpassword"
                    control={signUpForm.control}
                    name="confirmPassword"
                    render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                      <View style={{ gap: 4 }}>
                        <AnimatedInput
                          iconName="shield-checkmark-outline"
                          placeholder="Confirm password"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          secureTextEntry={!showConfirmPassword}
                          hasError={!!error}
                          theme={theme}
                          isDark={isDark}
                          showEyeIcon={true}
                          isEyeOff={showConfirmPassword}
                          onEyePress={() => setShowConfirmPassword(!showConfirmPassword)}
                        />
                        {error && <Text style={{ color: theme.error, fontSize: 12, marginLeft: 8 }}>{error.message}</Text>}
                      </View>
                    )}
                  />
                </>
              )}

              {/* Forgot Password */}
              {authMode === 'signin' && (
                <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} style={styles.forgotPasswordContainer}>
                  <Text style={[styles.forgotPasswordText, { color: theme.primary }]}>Forgot Password?</Text>
                </TouchableOpacity>
              )}

              {/* API Messages */}
              {apiError !== '' && (
                <View style={[styles.messageBox, { backgroundColor: theme.errorBg, borderColor: theme.errorBorder }]}>
                  <Ionicons name="alert-circle" size={16} color={theme.error} style={{ marginRight: 8 }} />
                  <Text style={[styles.messageText, { color: theme.error }]}>{apiError}</Text>
                </View>
              )}
              {apiSuccess !== '' && (
                <View style={[styles.messageBox, { backgroundColor: theme.successBg, borderColor: theme.successBorder }]}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.success} style={{ marginRight: 8 }} />
                  <Text style={[styles.messageText, { color: theme.success }]}>{apiSuccess}</Text>
                </View>
              )}

              {/* Auth Buttons */}
              <TouchableOpacity
                style={[styles.solidButton, { backgroundColor: theme.primary, opacity: isSignInLoading || isSignUpLoading ? 0.7 : 1 }]}
                onPress={authMode === 'signin' ? signInForm.handleSubmit(handleSignIn) : signUpForm.handleSubmit(handleSignUp)}
                disabled={isSignInLoading || isSignUpLoading}
              >
                {isSignInLoading || isSignUpLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.solidButtonText}>{authMode === 'signin' ? 'Sign In' : 'Sign Up'}</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                <Text style={[styles.dividerText, { color: theme.textTertiary }]}>OR CONTINUE WITH</Text>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              </View>

              {/* Social Logins */}
              <View style={styles.socialRow}>
                <TouchableOpacity style={[styles.socialButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderColor: 'transparent' }]} onPress={handleGoogleAuth}>
                  <Image source={{ uri: 'https://img.icons8.com/color/48/000000/google-logo.png' }} style={styles.socialIcon} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.socialButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderColor: 'transparent' }]} onPress={handleZohoSignIn}>
                  <Image source={require('../../assets/images/zoho-logo-540x540-1.png')} style={styles.socialIcon} />
                </TouchableOpacity>
              </View>


            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1527',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  topSection: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
    flex: 1,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  horizontalLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoTextCol: {
    justifyContent: 'center',
  },
  logoTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: FONT_FAMILY,
  },
  logoSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    fontFamily: FONT_FAMILY,
  },
  badgesCol: {
    gap: 16,
    marginTop: 20,
    alignItems: 'flex-end',
  },
  badgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(11, 21, 39, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  badgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    fontFamily: FONT_FAMILY,
  },
  bottomSheetWrapper: {
    paddingTop: 32, // Space for the floating icon
  },
  bottomSheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  floatingIconContainer: {
    position: 'absolute',
    top: -24,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    alignSelf: 'center',
  },
  tab: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 10,
  },
  activeTab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: FONT_TRACKING.body,
    fontFamily: FONT_FAMILY,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: FONT_FAMILY,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
    lineHeight: 20,
    fontFamily: FONT_FAMILY,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONT_FAMILY,
    height: '100%',
  },
  eyeButton: {
    padding: 8,
  },
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginTop: -8,
    marginBottom: 8,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: FONT_FAMILY,
  },
  solidButton: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  solidButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: FONT_FAMILY,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 12,
    letterSpacing: 0.5,
    fontFamily: FONT_FAMILY,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  socialButton: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  socialIcon: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
    paddingTop: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  trustTextCol: {
    justifyContent: 'center',
  },
  trustTitle: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: FONT_FAMILY,
  },
  trustSub: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: FONT_FAMILY,
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    fontFamily: FONT_FAMILY,
  }
});
