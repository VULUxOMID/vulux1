import * as Haptics from 'expo-haptics';

export const hapticTap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

export const hapticConfirm = () =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

export const hapticSuccess = hapticConfirm;

export const hapticWarn = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

export const hapticImpact = (style: 'light' | 'medium' | 'heavy' | 'error' = 'medium') => {
  const styles = {
    light: Haptics.ImpactFeedbackStyle.Light,
    medium: Haptics.ImpactFeedbackStyle.Medium,
    heavy: Haptics.ImpactFeedbackStyle.Heavy,
    error: Haptics.ImpactFeedbackStyle.Heavy, // Map error to heavy
  };
  return Haptics.impactAsync(styles[style]);
};





