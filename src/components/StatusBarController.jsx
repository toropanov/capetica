import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isNativeAndroid } from '../utils/platform';

function StatusBarController() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isNativeAndroid()) return undefined;

    const syncStatusBar = async () => {
      try {
        const choosePaths = ['/', '/character'];
        const isChooseScreen = choosePaths.some((path) =>
          path === '/' ? pathname === '/' : pathname.startsWith(path),
        );
        if (isChooseScreen) {
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
