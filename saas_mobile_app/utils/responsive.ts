import { Dimensions, PixelRatio, useWindowDimensions } from 'react-native';

// Guideline dimensions based on standard mobile device (iPhone X / 11 / 12 / 13 standard width & height)
const GUIDELINE_BASE_WIDTH = 375;
const GUIDELINE_BASE_HEIGHT = 812;

/**
 * Linear horizontal scaling based on screen width.
 * @param size - Base design size in points
 */
export function scale(size: number): number {
  const { width } = Dimensions.get('window');
  return Math.round((width / GUIDELINE_BASE_WIDTH) * size);
}

/**
 * Linear vertical scaling based on screen height.
 * @param size - Base design size in points
 */
export function verticalScale(size: number): number {
  const { height } = Dimensions.get('window');
  return Math.round((height / GUIDELINE_BASE_HEIGHT) * size);
}

/**
 * Moderate scaling that provides a controlled scaling factor (default factor = 0.5),
 * ensuring components do not grow too large on tablets or shrink too small on compact phones.
 * @param size - Base design size
 * @param factor - Scaling dampener (0 = no scale, 1 = full scale, default = 0.5)
 */
export function moderateScale(size: number, factor = 0.5): number {
  const { width } = Dimensions.get('window');
  const scaled = (width / GUIDELINE_BASE_WIDTH) * size;
  return Math.round(size + (scaled - size) * factor);
}

/**
 * Percentage of screen width.
 * @param percentage - 0 to 100
 */
export function wp(percentage: number): number {
  const { width } = Dimensions.get('window');
  return Math.round((percentage * width) / 100);
}

/**
 * Percentage of screen height.
 * @param percentage - 0 to 100
 */
export function hp(percentage: number): number {
  const { height } = Dimensions.get('window');
  return Math.round((percentage * height) / 100);
}

/**
 * Hook providing reactive responsive dimension calculations that update dynamically
 * when window dimensions, orientation, or display zoom settings change.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const isSmallDevice = width < 360;
  const isMediumDevice = width >= 360 && width < 414;
  const isLargeDevice = width >= 414 && width < 600;
  const isTablet = width >= 600;

  const dynamicScale = (size: number) => Math.round((width / GUIDELINE_BASE_WIDTH) * size);
  const dynamicVerticalScale = (size: number) => Math.round((height / GUIDELINE_BASE_HEIGHT) * size);
  const dynamicModerateScale = (size: number, factor = 0.5) => {
    const scaled = (width / GUIDELINE_BASE_WIDTH) * size;
    return Math.round(size + (scaled - size) * factor);
  };
  const dynamicWp = (percentage: number) => Math.round((percentage * width) / 100);
  const dynamicHp = (percentage: number) => Math.round((percentage * height) / 100);

  return {
    width,
    height,
    isSmallDevice,
    isMediumDevice,
    isLargeDevice,
    isTablet,
    scale: dynamicScale,
    verticalScale: dynamicVerticalScale,
    moderateScale: dynamicModerateScale,
    wp: dynamicWp,
    hp: dynamicHp,
  };
}
