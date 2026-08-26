import React from 'react';
import { Text, TextInput } from 'react-native';

/**
 * Enforces consistent font sizes across all iOS & Android devices
 * regardless of device Accessibility -> Font Size / Display Size settings.
 */
export function configureGlobalFontScaling() {
  try {
    // 1. Set defaultProps on Text component
    if ((Text as any).defaultProps == null) {
      (Text as any).defaultProps = {};
    }
    (Text as any).defaultProps.allowFontScaling = false;
    (Text as any).defaultProps.maxFontSizeMultiplier = 1;

    // 2. Set defaultProps on TextInput component
    if ((TextInput as any).defaultProps == null) {
      (TextInput as any).defaultProps = {};
    }
    (TextInput as any).defaultProps.allowFontScaling = false;
    (TextInput as any).defaultProps.maxFontSizeMultiplier = 1;

    // 3. Wrap render methods to ensure scaling lock across all React Native wrappers
    const oldTextRender = (Text as any).render;
    if (typeof oldTextRender === 'function') {
      (Text as any).render = function (...args: any[]) {
        const origin = oldTextRender.apply(this, args);
        if (origin && origin.props && (origin.props.allowFontScaling !== false || origin.props.maxFontSizeMultiplier !== 1)) {
          return React.cloneElement(origin, {
            allowFontScaling: false,
            maxFontSizeMultiplier: 1,
          });
        }
        return origin;
      };
    }

    const oldTextInputRender = (TextInput as any).render;
    if (typeof oldTextInputRender === 'function') {
      (TextInput as any).render = function (...args: any[]) {
        const origin = oldTextInputRender.apply(this, args);
        if (origin && origin.props && (origin.props.allowFontScaling !== false || origin.props.maxFontSizeMultiplier !== 1)) {
          return React.cloneElement(origin, {
            allowFontScaling: false,
            maxFontSizeMultiplier: 1,
          });
        }
        return origin;
      };
    }
  } catch (err) {
    console.warn('[FontScaling] Error configuring global font scaling:', err);
  }
}

// Auto-run immediately when imported
configureGlobalFontScaling();
