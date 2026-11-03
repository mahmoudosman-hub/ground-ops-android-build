import '../../i18n/ar.js'; // القاموس العربي (d47)
import { mountEmployeeApp } from './app.js';
import { initPwa } from '../../services/pwa.js';
import { installNativeBridge } from '../../services/native/bridge.js';
import '../../services/ping-response.js'; // بعت الموقع تلقائياً لما التطبيق يفتح من "📍 نبضة موقع"
installNativeBridge(); // no-op in a normal browser / iPhone PWA; inside the Android APK it enables the foreground-service tracker
initPwa();
mountEmployeeApp(globalThis.document.getElementById('app'));
