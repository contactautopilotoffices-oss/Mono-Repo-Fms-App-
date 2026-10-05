module.exports = function (api) {
  api.cache(true);

  // Release builds strip console.log/debug/info. They are not free: each call
  // formats its arguments and Sentry turns it into a breadcrumb, and there are
  // ~100 of them on hot paths (every render, every request). warn and error are
  // kept so real problems still reach Sentry.
  const isProduction = process.env.NODE_ENV === 'production' || process.env.BABEL_ENV === 'production';

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'babel-plugin-transform-import-meta',
      ...(isProduction
        ? [['transform-remove-console', { exclude: ['error', 'warn'] }]]
        : []),
      'react-native-reanimated/plugin',
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': '.',
            '@/app': './app',
            '@/assets': './assets',
            '@/components': './components',
            '@/context': './context',
            '@/hooks': './hooks',
            '@/lib': './lib',
            '@/types': './types',
            '@/utils': './utils',
            '@/constants': './constants',
            '@/stores': './stores',
            '@/services': './services',
          },
          extensions: ['.ios.ts', '.android.ts', '.ts', '.ios.tsx', '.android.tsx', '.tsx', '.jsx', '.js', '.json'],
        },
      ],
    ],
  };
};
