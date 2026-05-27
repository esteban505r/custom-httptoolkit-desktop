import { protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';

export const UI_SCHEME = 'app';
export const UI_HOST = 'httptoolkit';
export const UI_ORIGIN = `app://${UI_HOST}`;

/**
 * Whether a frame URL is our trusted UI. For http(s) dev URLs, use origin.
 * For app://, Node/Electron report origin as "null", so match protocol + host.
 */
export function isTrustedAppUrl(url: URL, appUrl: string): boolean {
    if (appUrl.startsWith('http://') || appUrl.startsWith('https://')) {
        return url.origin === new URL(appUrl).origin;
    }
    return url.protocol === `${UI_SCHEME}:` && url.host === UI_HOST;
}

/**
 * Must be called synchronously before app.on('ready').
 * Registers the custom 'app://' scheme as a privileged secure origin so the
 * SPA can use fetch, SharedArrayBuffer, etc. without CORS restrictions.
 */
export function registerUIScheme() {
    protocol.registerSchemesAsPrivileged([{
        scheme: UI_SCHEME,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
        }
    }]);
}

/**
 * Must be called inside app.on('ready').
 * Handles all app://httptoolkit/* requests by serving files from the
 * ui-dist/ directory bundled in extraResources, with an index.html
 * fallback for SPA client-side routing.
 */
export function handleUIProtocol(resourcesPath: string) {
    protocol.handle(UI_SCHEME, (request) => {
        const url = new URL(request.url);
        let filePath = path.join(resourcesPath, 'ui-dist', url.pathname);
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            filePath = path.join(resourcesPath, 'ui-dist', 'index.html');
        }
        return net.fetch(pathToFileURL(filePath).toString());
    });
}
