// useGeistFonts.ts — carrega a família Geist para uso no app
import * as Font from 'expo-font';

export const GEIST_FONTS = {
  'Geist-Regular':  require('../../assets/fonts/Geist-Regular.ttf'),
  'Geist-Medium':   require('../../assets/fonts/Geist-Medium.ttf'),
  'Geist-SemiBold': require('../../assets/fonts/Geist-SemiBold.ttf'),
  'Geist-Bold':     require('../../assets/fonts/Geist-Bold.ttf'),
} as const;

export function useGeistFonts() {
  const [loaded, error] = Font.useFonts(GEIST_FONTS);
  return { fontsLoaded: loaded, fontError: error };
}

