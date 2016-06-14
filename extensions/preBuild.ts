/**
 * Make modifications to source pre build
 */
/** imports */
import {readFile, writeFile, getAllFilesInFolder, copy, stringify} from "./utils";
import * as utils from "./utils";
const path = require('path');

/**
 * Any line changes
 */
var contentFixes = [
    {
        /** Allows us to build monaco.d.ts */
        fileName: './vscode/gulpfile.js',
        orig: `if (isWatch) {`,
        new: `if (true) {`
    },
    {
        /** ship marked as a part of the build */
        fileName: './vscode/build/gulpfile.editor.js',
        orig: `result.paths['vs/base/common/marked/marked'] = 'out-build/vs/base/common/marked/marked.mock';`,
        new: ``
    },

    /** Remove gulp target we do not need (also helps us removing thier deps from npm install) */
    {
        fileName: './vscode/gulpfile.js',
        orig: `require('./build/gulpfile.hygiene');`,
        new: ``
    },
    {
        fileName: './vscode/gulpfile.js',
        orig: `require('./build/gulpfile.vscode');`,
        new: ``
    },
];

for (let fix of contentFixes) {
    writeFile(fix.fileName, readFile(fix.fileName).replace(fix.orig, fix.new));
}

/**
 * Package.json cleanups
 */
const packagesWeDontWant = [
    // node-gyp
    "pty.js",
    "vscode-textmate",
    "native-keymap",
    "windows-mutex",
    "preinstall", // Don't want preinstall (its there to protect us from using `npm install` vs. `atom's npm install`. We are fine with npm)
]
const packageJsonPath = "./vscode/package.json";
packagesWeDontWant.forEach(packageName => {
    writeFile(packageJsonPath, readFile(packageJsonPath).split('\n').filter(x => !x.includes(packageName)).join('\n'));
})
const packJsonContents = JSON.parse(readFile(packageJsonPath));

/** We also don't want their ghooks to get triggered */
delete packJsonContents.config;
delete packJsonContents.devDependencies.ghooks;

/** I am tired of installing all these packages so only leave the ones that are *must* for the subset of build we are making */
const keepThePackages = [
    /**
     * Adding to this list is not that hard.
     * You generally get a stack trace on a `require` load fail ;) and then you know all the other require calls in the root of that file
     */
    /** gulpfile.js */
    'gulp',
    'gulp-json-editor',
    'gulp-buffer',
    'gulp-tsb',
    'gulp-filter',
    'gulp-mocha',
    'event-stream',
    'gulp-remote-src',
    'gulp-vinyl-zip',
    'gulp-bom',
    'gulp-sourcemaps',
    'underscore',
    'object-assign',
    'typescript',
    /** build/lib/nls.ts */
    'lazy.js',
    'clone',
    'vinyl',
    'source-map',
    /** build/lib/util.js */
    'debounce',
    'gulp-azure-storage',
    'azure-storage',
    'gulp-rename',
    'gulp-vinyl-zip',
    'gulp-util',
    'rimraf',
    /** build/gulpfile.common.js */
    'gulp-cssnano',
    'gulp-uglify',
    'gulp-concat',
    'gulp-util',
    /** build/gulpfile.extension.js */
    'vscode-nls-dev',
    /** build/watch/index.js */
    'gulp-watch',
]
Object.keys(packJsonContents.dependencies).forEach(dep => {
    if (keepThePackages.indexOf(dep) !== -1) return;
    delete packJsonContents.dependencies[dep];
})
Object.keys(packJsonContents.devDependencies).forEach(dep => {
    if (keepThePackages.indexOf(dep) !== -1) return;
    delete packJsonContents.devDependencies[dep];
})

/** Don't want post install or any other script either */
delete packJsonContents.scripts;

/** Finally write out package.json */
writeFile(packageJsonPath, stringify(packJsonContents));

/**
 * also delete shrinkwrap (otherwise `npm install` will install these too)
 */
utils.remove(utils.resolve('./vscode/npm-shrinkwrap.json'));


/**
 * Extend the monaco API to expose more stuff
 * Some notes:
 * - please append to editor.main whatever you export here to prevent runtime errors
 */
const recipeFile = "./vscode/build/monaco/monaco.d.ts.recipe";
const recipeAdditions = `
/** We wanted CommonEditorRegistry. Rest is brought in for it */

declare module monaco {

    /** Stuff from "types" */
    #include(vs/base/common/types): TypeConstraint


    /** Stuff from instantiation **/
    #include(vs/platform/instantiation/common/instantiation): IConstructorSignature1, IConstructorSignature2, ServiceIdentifier, ServicesAccessor, optional
    /** Was a really deep rabbit hole so shortened */
    export type IInstantiationService = any;
}

declare module monaco.editor {

    #include(vs/editor/common/editorCommon): ICommonEditorContributionCtor, ICommonEditorContributionDescriptor, IEditorActionContributionCtor, IEditorActionDescriptorData

}

declare module monaco.internal {

    #include(vs/editor/common/editorCommonExtensions;editorCommon=>monaco.editor): CommonEditorRegistry, EditorActionDescriptor, IEditorCommandHandler, IEditorActionKeybindingOptions, ContextKey
    #include(vs/platform/keybinding/common/keybindingService): IKeybindings, ICommandHandler, ICommandHandlerDescription, KbExpr, KbExprType, ICommandsMap, IKeybindingItem

}

/** We wanted KeyBindingsRegistry. Rest is brought in for it */
declare module monaco.internal {
    #include(vs/platform/keybinding/common/keybindingsRegistry): KeybindingsRegistry, IKeybindingsRegistry, ICommandRule, ICommandDescriptor
}
`;
writeFile(recipeFile, readFile(recipeFile) + recipeAdditions);

/**
 * Add to editor.main
 */
const editorMainFile = "./vscode/src/vs/editor/editor.main.ts";
const editorMainAdditions = `
/** expose more stuff from monaco */
import {CommonEditorRegistry, EditorActionDescriptor} from "vs/editor/common/editorCommonExtensions";
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
global.monaco.internal = {
    CommonEditorRegistry,
    EditorActionDescriptor,
    KeybindingsRegistry,
}
`;
writeFile(editorMainFile, readFile(editorMainFile) + editorMainAdditions);


/**
 * Also add in all the languages from `monaco-languages`
 */
// Copy monaco-languages src to vscode
utils.copy(utils.resolve('./monaco-languages/src'), utils.resolve('./vscode/src/vs/editor/standalone-languages'));
// Fix monaco-languages names
utils.getAllFilesInFolder(utils.resolve('./vscode/src/vs/editor/standalone-languages')).forEach(filePath => {
    const contents = readFile(filePath).replace(
        'import IRichLanguageConfiguration = monaco.languages.IRichLanguageConfiguration;',
        'import IRichLanguageConfiguration = monaco.languages.LanguageConfiguration;'
    );
    writeFile(filePath, contents);
});
// Copy the `all.ts` which loads these languages
writeFile(editorMainFile, readFile(editorMainFile) + readFile('./standalone-languages/all.ts'));
/** Copy `buildfile.js` to include the language modules */
utils.copy(utils.resolve('./standalone-languages/buildfile.js'), utils.resolve('./vscode/src/vs/editor/buildfile.js'));
// remove `monaco.contribution`
utils.remove(utils.resolve('./vscode/src/vs/editor/standalone-languages/monaco.contribution.ts'));


/**
 * Moar fixes
 */
interface IFix {
    orig: string;
    new: string;
}
interface IFixForFile {
    filePath: string,
    fixes: IFix[]
}
const fixesForFiles: IFixForFile[] = [
    /**
     * Keybinding changes
     */
    /** prefer format command shortcut in intellij idea */
    {
        filePath: './vscode/src/vs/editor/contrib/format/common/formatActions.ts',
        fixes: [
            {
                orig: `primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_F,`,
                new: `primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_L,`
            },
            {
                orig: `linux: { primary:KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I }`,
                new: `linux: { primary:KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_L }`
            },
        ]
    }
]

fixesForFiles.forEach(fff => {
    let content = readFile(fff.filePath);
    fff.fixes.forEach(fix => {
        content = content.replace(fix.orig, fix.new);
    })
    writeFile(fff.filePath, content);
})
