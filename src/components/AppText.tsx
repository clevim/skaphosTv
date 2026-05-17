// AppText.tsx — wrapper de Text com Geist como fontFamily padrão
// Substitui Text do React Native nos títulos e textos importantes.
import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { fontFamily } from '../utils/theme';

type Weight = 'regular' | 'medium' | 'semiBold' | 'bold';

interface Props extends TextProps {
  weight?: Weight;
}

export default function AppText({ weight = 'regular', style, ...props }: Props) {
  const family: TextStyle = { fontFamily: fontFamily[weight] };
  return <Text style={[family, style]} {...props} />;
}
