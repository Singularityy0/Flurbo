const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Share the reviewed network registry with the read-only CLI without copying addresses.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../../config')];
module.exports = config;
