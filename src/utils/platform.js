import { Capacitor } from '@capacitor/core';

export function isNativeAndroid() {
  if (typeof Capacitor === 'undefined' || typeof Capacitor.getPlatform !== 'function') {
    return false;
  }
  if (Capacitor.getPlatform() !== 'android') {
    return false;
  }
  if (typeof Capacitor.isNativePlatform === 'function') {
    return Capacitor.isNativePlatform();
  }
  return true;
}
