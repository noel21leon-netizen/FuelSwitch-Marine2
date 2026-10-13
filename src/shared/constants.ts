// Single source for user-facing safety wording. Do not paraphrase these in components.
export const PRODUCT_NAME = 'FuelSwitch Marine';
export const FEATURE_NAME = 'ECA Changeover Assistant';

export const DEMO_BANNER_TEXT = 'DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE';

export const ADVISORY_TEXT =
  'Advisory prototype. Not an approved navigation system. It never operates fuel equipment and makes no compliance claim.';

export const BACKGROUND_GPS_LIMIT_TEXT =
  'Web apps cannot guarantee GPS tracking or alerts after the phone suspends or closes this app. Keep the app open and the screen awake while monitoring. A service worker does not track location.';

export const SIMULATED_LABEL = 'SIMULATED';

export const NOTIFICATION_LIMIT_TEXT =
  'Alerts are shown only while this app is open. A web app cannot guarantee notifications after the phone suspends or closes it, and a notification is not a substitute for watching the countdown. Notifications need permission and may be unsupported on some browsers.';

export const UPDATE_RELOAD_WARNING =
  'Applying the update reloads the app and restarts live monitoring: the simulator replay starts again and this session\'s alert list is cleared. Saved settings and log entries stay on this device. Update only when it is safe to do so.';

export const OFFLINE_SCOPE_TEXT =
  'App files and the bundled demo data are cached on this device. Map tiles are not cached and need internet. Reload the app while offline to check it on your device.';

export const DATASET_STATUS_BASIS_TEXT =
  'Status is taken from the dataset file\'s own metadata and its effective dates. This app cannot independently verify a boundary dataset. Expired data is not used for calculations.';

export const NOX_SCOPE_TEXT =
  'NOx is a separate engine certification and regulatory applicability workflow. This prototype does not determine NOx compliance.';

export const INSTALL_HTTPS_TEXT =
  'Installing a web app and offline use require HTTPS. A self-signed development certificate (npm run dev:https) usually will not install on a phone; use a real HTTPS deployment or tunnel.';
