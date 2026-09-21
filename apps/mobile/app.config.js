module.exports = ({ config }) => ({
  ...config,
  // Browser rendering is an opt-in layout check, separate from native exports.
  platforms: process.env.FLURBO_WEB_PREVIEW === '1'
    ? ['ios', 'android', 'web']
    : ['ios', 'android'],
});
