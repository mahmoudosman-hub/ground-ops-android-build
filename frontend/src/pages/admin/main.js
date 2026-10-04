import { mountAdminApp } from './app.js';
import { initPwa } from '../../services/pwa.js';
initPwa();
mountAdminApp(globalThis.document.getElementById('app'));
