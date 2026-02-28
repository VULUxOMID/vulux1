import React from 'react';
import { Ionicons } from '@expo/vector-icons';

interface CashIconProps {
  size?: number;
  color?: string;
}

export function CashIcon({ size = 24, color = '#000' }: CashIconProps) {
  return (
    <Ionicons 
      name="cash" 
      size={size} 
      color={color} 
    />
  );
}
