#!/bin/sh
# Xcode Cloud runs this right after it clones the repo, before resolving Swift packages.
# The iOS project links its Capacitor plugins from node_modules and ships the web game from dist,
# so install them, build the game and copy it into the iOS project first.
set -euo pipefail

cd "$CI_PRIMARY_REPOSITORY_PATH"

echo "Installing Node…"
export HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_AUTO_UPDATE=1
brew install node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"
node --version

echo "Installing packages…"
npm ci --no-audit --no-fund

echo "Building the game…"
npm run build

echo "Copying it into the iOS app…"
npx cap sync ios

# Every Xcode Cloud build gets its own build number, so there's nothing to bump by hand.
if [ -n "${CI_BUILD_NUMBER:-}" ]; then
  sed -i '' -E "s/CURRENT_PROJECT_VERSION = [0-9.]+;/CURRENT_PROJECT_VERSION = ${CI_BUILD_NUMBER};/g" ios/App/App.xcodeproj/project.pbxproj
  echo "Build number set to $CI_BUILD_NUMBER"
fi
