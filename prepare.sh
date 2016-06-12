#!/bin/sh
set -e

git submodule update --recursive --init

# Official Microsoft/vscode clone
cd ./vscode

# Reset to origin.
# commented out `git clean` for faster npm install
# git clean -xfd
git fetch origin
git reset --hard origin/master

# Do pre build modifications
../node_modules/.bin/tsc -p ../extensions/tsconfig.json
node ../extensions/preBuild.js

#
# Build monaco
#

# Rebuild the api.js file
./node_modules/.bin/tsc ./src/typings/node.d.ts ../extensions/globals.d.ts ./build/monaco/api.ts

# Install everything
npm install

# This generates the `out-editor` folder which is for npm publishing
./node_modules/.bin/gulp optimize-editor

# Copy it out to our `build` folder
rm -rf ../build
mkdir -p ../build
cp -r ./out-editor/vs ../build
cp ./src/vs/monaco.d.ts ../build

# Do post build modifications
node ../extensions/postBuild.js

# Again reset sub repo (so we don't leave the submodule dirty)
git reset --hard origin/master
