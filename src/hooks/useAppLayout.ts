import { Dimensions } from 'react-native';

const TOPBAR_H = 57;
const SIDEBAR_NAV_H = 310;
const SIDEBAR_BOTTOM_H = 95;

export function useAppLayout() {
  const { height, width } = Dimensions.get('window');
  return {
    windowH: height,
    windowW: width,
    mainContentH: height - TOPBAR_H,
    sidebarCatH: Math.max(100, height - SIDEBAR_NAV_H - SIDEBAR_BOTTOM_H),
  };
}