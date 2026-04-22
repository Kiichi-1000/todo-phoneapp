import { useWindowDimensions } from 'react-native';

const CONTENT_MAX_WIDTH = 600;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;

  return {
    screenWidth: width,
    screenHeight: height,
    isTablet,
    contentMaxWidth: isTablet ? CONTENT_MAX_WIDTH : undefined,
    contentPadding: isTablet ? 24 : 16,
  };
}
