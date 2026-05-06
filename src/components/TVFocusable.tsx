import React, { useRef, useState, useCallback } from 'react';
import {
  TouchableOpacity,
  Animated,
  Platform,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { colors } from '../utils/theme';

interface TVFocusableProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  focusStyle?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
  accessible?: boolean;
  accessibilityLabel?: string;
}

/**
 * A pressable component optimized for TV remote/D-pad navigation.
 * Renders with visible focus ring on TV, standard press feedback on mobile.
 */
export default function TVFocusable({
  children,
  onPress,
  onLongPress,
  style,
  focusStyle,
  hasTVPreferredFocus = false,
  accessible = true,
  accessibilityLabel,
}: TVFocusableProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1.07, useNativeDriver: true, speed: 20 }),
      Animated.timing(glowAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
    ]).start();
  }, [scaleAnim, glowAnim]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }),
      Animated.timing(glowAnim, { toValue: 0, duration: 150, useNativeDriver: false }),
    ]).start();
  }, [scaleAnim, glowAnim]);

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.accent2],
  });

  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.8],
  });

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        isFocused && styles.focusGlow,
      ]}
    >
      <Animated.View
        style={[
          styles.focusBorder,
          { borderColor, shadowOpacity },
          isFocused && (focusStyle || styles.defaultFocusStyle),
        ]}
      >
        <TouchableOpacity
          onPress={onPress}
          onLongPress={onLongPress}
          style={style}
          onFocus={handleFocus}
          onBlur={handleBlur}
          hasTVPreferredFocus={hasTVPreferredFocus}
          accessible={accessible}
          accessibilityLabel={accessibilityLabel}
          activeOpacity={0.85}
          {...(Platform.isTV ? { isTVSelectable: true } : {})}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  focusBorder: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 0,
  },
  focusGlow: {
    elevation: 12,
  },
  defaultFocusStyle: {
    borderColor: colors.accent2,
  },
});
