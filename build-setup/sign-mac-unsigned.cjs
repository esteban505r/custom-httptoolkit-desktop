/**
 * Ad-hoc sign unsigned Mac builds so they launch locally.
 *
 * Unsigned electron-builder output often applies hardened runtime to the
 * bundled httptoolkit-server Node binary, while native .node addons are only
 * ad-hoc signed without runtime. Node then fails to dlopen them (Team ID mismatch).
 *
 * This re-signs the app bundle and strips hardened runtime from the server Node.
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function run(cmd, args) {
    execFileSync(cmd, args, { stdio: 'inherit' });
}

function signMacUnsignedApp(context) {
    if (context.electronPlatformName !== 'darwin') return;

    const appName = `${context.packager.appInfo.productFilename}.app`;
    const appPath = path.join(context.appOutDir, appName);

    if (!fs.existsSync(appPath)) {
        throw new Error(`Expected app bundle at ${appPath}`);
    }

    console.log('\nAd-hoc signing unsigned Mac build:', appPath);

    run('xattr', ['-cr', appPath]);
    run('codesign', ['--deep', '--force', '--sign', '-', appPath]);

    // Deep sign re-applies hardened runtime to the bundled server Node; strip it again
    // so native .node addons (e.g. node-datachannel) can load.
    const serverNode = path.join(
        appPath,
        'Contents/Resources/httptoolkit-server/bin/node'
    );
    if (fs.existsSync(serverNode)) {
        run('codesign', ['--remove-signature', serverNode]);
        run('codesign', ['--force', '--sign', '-', serverNode]);
    }

    console.log('Unsigned Mac ad-hoc signing completed.\n');
}

module.exports = { signMacUnsignedApp };
