import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

const isNativeAndroid = () => {
  if (typeof Capacitor === 'undefined' || typeof Capacitor.getPlatform !== 'function') {
    return false;
  }
  const platform = Capacitor.getPlatform();
  if (platform !== 'android') {
    return false;
  }
  if (typeof Capacitor.isNativePlatform === 'function') {
    return Capacitor.isNativePlatform();
  }
  return true;
};

function StatusBarController() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isNativeAndroid()) return undefined;

    const syncStatusBar = async () => {
      try {
        if (pathname === '/choose') {
          await StatusBar.setOverlaysWebView({ overlay: true });
          await StatusBar.show();
          await StatusBar.setStyle({ style: Style.Light });
        } else {
          await StatusBar.setOverlaysWebView({ overlay: false });
          await StatusBar.setBackgroundColor({ color: '#FFFFFFFF' });
          await StatusBar.show();
          await StatusBar.setStyle({ style: Style.Light });
        }
      } catch (error) {
        console.warn('Failed to apply status bar style', error);
      }
    };

    void syncStatusBar();
    return undefined;
  }, [pathname]);

  return null;
}

export default StatusBarController;
