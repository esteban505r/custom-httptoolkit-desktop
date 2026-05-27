// This config just re-exposes the config from package.json, but
// disables code signing & notarization for PR builds where it won't work.

const packageJson = require('../package.json');
const { signMacUnsignedApp } = require('./sign-mac-unsigned.cjs');

const unsignedMode = process.env.ENABLE_SIGNING !== 'true';

const config = packageJson.build;

if (unsignedMode) {
  console.log('\nBuilding in UNSIGNED mode\n');

  // Make it abundantly clear in the output that the builds aren't signed, so
  // we don't accidentally distribute them. Different app & file names throughout.
  config.productName = packageJson.name + ' - dev build';
  config.extraMetadata.name += '-dev';
  config.extraMetadata.productName += '-dev';

  config.artifactName = config.artifactName.replace('${ext}', 'dev.${ext}');
  for (let field in config) {
    if (config[field]?.artifactName) {
      config[field].artifactName =
        config[field].artifactName.replace('${ext}', 'dev.${ext}');
    }
  }

  config.mac.forceCodeSigning = false;
  config.mac.notarize = false;
  config.mac.hardenedRuntime = false;
  delete config.mac.entitlements;
  delete config.mac.entitlementsInherit;
  config.win.forceCodeSigning = false;
  delete config.win.azureSignOptions;
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

  // Re-signing the .app for local use invalidates embedded asar integrity checks.
  config.electronFuses = {
    ...config.electronFuses,
    enableEmbeddedAsarIntegrityValidation: false,
    resetAdHocDarwinSignature: true,
  };

  const existingAfterPack = config.afterPack;
  config.afterPack = async (context) => {
    if (existingAfterPack) await existingAfterPack(context);
    signMacUnsignedApp(context);
  };
} else {
  console.log('\nBuilding in SIGNED mode\n');
}

module.exports = config;
