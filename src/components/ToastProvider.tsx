import React, { useState, useEffect } from 'react';
import { Toast, ToastProps } from './Toast';

type ToastProviderProps = {
  children: React.ReactNode;
};

export function ToastProvider({ children }: ToastProviderProps) {
  const [currentToast, setCurrentToast] = useState<ToastProps | null>(null);

  useEffect(() => {
    const { toast } = require('./Toast');
    
    const unsubscribe = toast.subscribe((toast: ToastProps | null) => {
      setCurrentToast(toast);
    });

    return unsubscribe;
  }, []);

  return (
    <>
      {children}
      {currentToast && (
        <Toast
          message={currentToast.message}
          type={currentToast.type}
          duration={currentToast.duration}
          visible={currentToast.visible}
          onHide={currentToast.onHide}
        />
      )}
    </>
  );
}
