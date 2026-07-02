import { useWindowDimensions } from 'react-native';

const TOPBAR_H = 57;
const SIDEBAR_NAV_H = 310;
const SIDEBAR_BOTTOM_H = 95;

/**
 * Medidas derivadas da janela. useWindowDimensions re-renderiza em
 * resize (web) e rotação (smartphone) — Dimensions.get('window') não.
 */
export function useAppLayout() {
  const { height, width } = useWindowDimensions();
  return {
    windowH: height,
    windowW: width,
    mainContentH: height - TOPBAR_H,
    sidebarCatH: Math.max(100, height - SIDEBAR_NAV_H - SIDEBAR_BOTTOM_H),
  };
}
