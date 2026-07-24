const fs = require('node:fs');
const path = require('node:path');

const { withFinalizedMod } = require('@expo/config-plugins');

const SYSTEM_SYMBOL_PREFIX = 'sf:';

function insertOnce(source, needle, replacement, fileName) {
  if (source.includes(replacement)) return source;
  if (!source.includes(needle)) {
    throw new Error(`Could not add Zona's Live Activity symbol support to ${fileName}.`);
  }
  return source.replace(needle, replacement);
}

function patchDynamicImage(source) {
  const needle = `extension Image {
  static func dynamic(assetNameOrPath: String) -> Self {
`;
  const replacement = `extension Image {
  static func dynamic(assetNameOrPath: String) -> Self {
    if assetNameOrPath.hasPrefix("${SYSTEM_SYMBOL_PREFIX}") {
      return Image(systemName: String(assetNameOrPath.dropFirst(${SYSTEM_SYMBOL_PREFIX.length})))
    }

`;
  return insertOnce(source, needle, replacement, 'Image+dynamic.swift');
}

function patchViewHelpers(source) {
  const modifierNeedle = `import SwiftUI

`;
  const modifierReplacement = `import SwiftUI

struct ZonaLiveActivitySymbolStyle: ViewModifier {
  let imageName: String

  @ViewBuilder
  func body(content: Content) -> some View {
    if imageName.hasPrefix("${SYSTEM_SYMBOL_PREFIX}") {
      content
        .symbolRenderingMode(.monochrome)
        .foregroundStyle(.white)
    } else {
      content
    }
  }
}

`;
  let result = insertOnce(source, modifierNeedle, modifierReplacement, 'ViewHelpers.swift');

  const styleNeedle = `  Image.dynamic(assetNameOrPath: imageName)
    .resizable()
    .scaledToFit()
`;
  const styleReplacement = `  Image.dynamic(assetNameOrPath: imageName)
    .resizable()
    .scaledToFit()
    .modifier(ZonaLiveActivitySymbolStyle(imageName: imageName))
`;
  result = insertOnce(result, styleNeedle, styleReplacement, 'ViewHelpers.swift');
  return result;
}

function patchLiveActivityView(source) {
  const needle = `      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: imageAlignment)
`;
  const replacement = `      }
      .modifier(ZonaLiveActivitySymbolStyle(imageName: imageName))
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: imageAlignment)
`;
  return insertOnce(source, needle, replacement, 'LiveActivityView.swift');
}

function patchSwiftFile(filePath, patcher) {
  const source = fs.readFileSync(filePath, 'utf8');
  const patched = patcher(source);
  if (patched !== source) fs.writeFileSync(filePath, patched);
}

function withZonaLiveActivitySymbol(config) {
  return withFinalizedMod(config, [
    'ios',
    (config) => {
      const widgetRoot = path.join(config.modRequest.platformProjectRoot, 'LiveActivity');
      patchSwiftFile(path.join(widgetRoot, 'Image+dynamic.swift'), patchDynamicImage);
      patchSwiftFile(path.join(widgetRoot, 'ViewHelpers.swift'), patchViewHelpers);
      patchSwiftFile(path.join(widgetRoot, 'LiveActivityView.swift'), patchLiveActivityView);
      return config;
    },
  ]);
}

module.exports = withZonaLiveActivitySymbol;
module.exports.patchDynamicImage = patchDynamicImage;
module.exports.patchViewHelpers = patchViewHelpers;
module.exports.patchLiveActivityView = patchLiveActivityView;
