const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The game ships as a single HTML file, bundled as an asset rather than as source.
config.resolver.assetExts.push('html');

module.exports = config;
