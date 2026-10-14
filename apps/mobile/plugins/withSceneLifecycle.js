// iOS 27 apps must adopt the UIScene life cycle or they fail to launch.
// Expo SDK 57 ships `ExpoAppSceneDelegate` for this, but the generated template
// doesn't use it yet. This plugin wires it up:
//  - Info.plist: a scene manifest pointing at EXExpoAppSceneDelegate
//  - AppDelegate: conforms to ExpoReactNativeFactoryProvider and leaves creating
//    the window and starting React Native to the scene delegate.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const START_BLOCK = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: 'EXExpoAppSceneDelegate' },
        ],
      },
    };
    return cfg;
  });

  return withAppDelegate(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    }
    if (START_BLOCK.test(src)) {
      src = src.replace(START_BLOCK, '    // The window and React Native start in ExpoAppSceneDelegate (scene life cycle).\n');
    } else if (!src.includes('ExpoAppSceneDelegate')) {
      throw new Error('withSceneLifecycle: AppDelegate template changed, update the plugin');
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
