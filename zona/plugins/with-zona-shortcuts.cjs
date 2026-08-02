const fs = require('node:fs');
const path = require('node:path');

const { IOSConfig, withXcodeProject } = require('@expo/config-plugins');

const shortcutsSource = `import AppIntents
import Foundation

@available(iOS 16.0, *)
struct OpenZonaInboxIntent: AppIntent {
  static var title: LocalizedStringResource = "Open Zona Inbox"
  static var description = IntentDescription("Open your Zona notification inbox.")
  static var openAppWhenRun = true

  func perform() async throws -> some IntentResult & ProvidesDialog {
    .result(dialog: "Opening your Zona inbox.")
  }
}

@available(iOS 16.0, *)
struct PrepareZonaAlertIntent: AppIntent {
  static var title: LocalizedStringResource = "Prepare a Zona Alert"
  static var description = IntentDescription("Create a JSON alert body for a Zona source request.")

  @Parameter(title: "Title")
  var alertTitle: String

  @Parameter(title: "Body")
  var alertBody: String

  static var parameterSummary: some ParameterSummary {
    Summary("Prepare alert \\(\\.$alertTitle)")
  }

  func perform() async throws -> some IntentResult & ReturnsValue<String> {
    let payload = ["title": alertTitle, "body": alertBody]
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
    return .result(value: String(decoding: data, as: UTF8.self))
  }
}

@available(iOS 16.0, *)
struct ZonaAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: OpenZonaInboxIntent(),
      phrases: ["Open \\(.applicationName) inbox", "Show my \\(.applicationName) alerts"],
      shortTitle: "Open Inbox",
      systemImageName: "bell.badge.fill"
    )
  }

  static var shortcutTileColor: ShortcutTileColor = .teal
}
`;

function withZonaShortcuts(config) {
  return withXcodeProject(config, (config) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
    const sourceDirectory = path.join(config.modRequest.platformProjectRoot, projectName);
    const sourcePath = path.join(sourceDirectory, 'ZonaShortcuts.swift');
    fs.mkdirSync(sourceDirectory, { recursive: true });
    if (!fs.existsSync(sourcePath) || fs.readFileSync(sourcePath, 'utf8') !== shortcutsSource) {
      fs.writeFileSync(sourcePath, shortcutsSource);
    }

    const target = IOSConfig.XcodeUtils.getApplicationNativeTarget({
      project: config.modResults,
      projectName,
    });
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${projectName}/ZonaShortcuts.swift`,
      groupName: projectName,
      project: config.modResults,
      targetUuid: target.uuid,
    });
    return config;
  });
}

module.exports = withZonaShortcuts;
module.exports.shortcutsSource = shortcutsSource;
