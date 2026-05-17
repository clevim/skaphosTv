const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== 'web') {
    return context.resolveRequest(context, moduleName, platform);
  }

  // Redireciona react-native-video para stub web
  if (moduleName === 'react-native-video') {
    return {
      filePath: path.resolve(__dirname, 'src/components/Video.web.tsx'),
      type: 'sourceFile',
    };
  }

  // Redireciona Platform para react-native-web
  if (moduleName === '../Utilities/Platform') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/react-native-web/dist/exports/Platform/index.js'),
      type: 'sourceFile',
    };
  }

  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (e) {
    console.warn(`[metro] Web: módulo ignorado: ${moduleName}`);
    return { type: 'empty' };
  }
};

module.exports = config;