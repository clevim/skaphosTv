/**
 * SonarLine — a "linha de sonda": hairline que nasce violeta e se dissolve
 * até desaparecer, como a varredura de um sonar se perdendo no escuro.
 * Assinatura dos títulos de seção do app — no lugar dos clichês de barrinha
 * ou bolinha antes do texto. O estado ativo de listas não usa ornamento:
 * quem o marca é a pílula violeta-névoa + ícone aceso.
 */
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function SonarLine({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      colors={['rgba(167,139,250,0.55)', 'rgba(167,139,250,0)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[{ flex: 1, height: 1 }, style]}
    />
  );
}
