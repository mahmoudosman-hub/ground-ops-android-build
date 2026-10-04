import { mountEmployeeApp } from './app.js';
import { initPwa } from '../../services/pwa.js';
import { installNativeBridge } from '../../services/native/bridge.js';
installNativeBridge(); // no-op in a normal browser / iPhone PWA; inside the Android APK it enables the foreground-service tracker
initPwa();
mountEmployeeApp(globalThis.document.getElementById('app'));
