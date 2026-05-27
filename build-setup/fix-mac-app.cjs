#!/usr/bin/env node
/**
 * Fix an unsigned Mac .app so it launches from Desktop/DMG (ad-hoc sign).
 * Requires a build made with enableEmbeddedAsarIntegrityValidation: false.
 *
 * Usage: node build-setup/fix-mac-app.cjs "/path/to/My.app"
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const appPath = process.argv[2];
if (!appPath || !fs.existsSync(appPath)) {
    console.error('Usage: node build-setup/fix-mac-app.cjs "/path/to/app.app"');
    process.exit(1);
}

function run(cmd, args) {
    console.log('$', cmd, args.join(' '));
    execFileSync(cmd, args, { stdio: 'inherit' });
}

function resignServerNode(app) {
    const serverNode = path.join(
        app,
        'Contents/Resources/httptoolkit-server/bin/node'
    );
    if (!fs.existsSync(serverNode)) return;

    run('codesign', ['--remove-signature', serverNode]);
    run('codesign', ['--force', '--sign', '-', serverNode]);
}

console.log('Fixing Mac app:', appPath);
run('xattr', ['-cr', appPath]);
run('codesign', ['--deep', '--force', '--sign', '-', appPath]);
resignServerNode(appPath);
console.log('Done. Open the app from Finder (Desktop is fine).');
