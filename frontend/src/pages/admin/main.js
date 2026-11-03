import '../../i18n/ar.js'; // القاموس العربي (d47)
import { mountAdminApp } from './app.js';
import { initPwa } from '../../services/pwa.js';
initPwa();
mountAdminApp(globalThis.document.getElementById('app'));
