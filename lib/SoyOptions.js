// Copyright 2014. A Medium Corporation.

var path = require('path')

/**
 * Describes the possible options set to a SoyCompiler.
 * @constructor
 */
function SoyOptions() {
  /**
   * A temporary directory where compiled .soy.js files will be stored after compilation.
   * @type {string}
   */
  this.tmpDir = '/tmp/soynode'

  /**
   * Directory where the compiler will spawn compilation process.
   * When compiling from files defaults to process.cwd(), if compiling from a directory inputDir is used instead.
   * @type {string}
   */
  this.inputDir = process.cwd()

  /**
   * An output directory, which compiled soy.js files is stored.
   * @type {?string}
   */
  this.outputDir = null

  /**
   * Whether the compiled soy files should be placed into a unique directory(timestamped).
   * @type {boolean}
   */
  this.uniqueDir = true

  /**
   * Whether to watch any files that are loaded and to refetch them when they change.
   * @type {boolean}
   */
  this.allowDynamicRecompile = false

  /**
   * Whether or not to load the compiled templates in the VM context.
   * @type {boolean}
   */
  this.loadCompiledTemplates = true

  /**
   * Whether to delete temporary files created during the compilation process.
   * @type {boolean}
   */
  this.eraseTemporaryFiles = false

  /**
   * Whether or not to use goog.provide and goog.require for JS functions and Soy namespaces.
   * @type {boolean}
   */
  this.useClosureStyle = false

  /**
   * The scheme to use for handling 'css' commands. Specifying
   * 'literal' will cause command text to be inserted as literal
   * text. Specifying 'reference' will cause command text to be
   * evaluated as a data or global reference. Specifying 'goog'
   * will cause generation of calls goog.getCssName. This option
   * has no effect if the Soy code does not contain 'css'
   * commands.
   * @type {?string}
   */
  this.cssHandlingScheme = undefined

  /**
   * Additional classpath to pass to the soy template compiler. This makes adding plugins possible.
   * @type {Array<string>}
   */
  this.classpath = []

  /**
   * Plugin module Java classnames to pass to the soy template compiler.
   * @type {Array<string>}
   */
  this.pluginModules = []

  /**
   * Additional JS files to be evaluated in the VM context for the soy templates.
   * Useful for soy function support libs
   * @type {Array<string>}
   */
  this.contextJsPaths = []

  /**
   * Whether the compiled soy.js files should be joined into a single file
   * @type {boolean}
   */
  this.concatOutput = false

  /**
   * File name used for concatenated files, only relevant when concatOutput is true.
   * @type {string}
   */
  this.concatFileName = 'compiled'

  /**
   * List of locales to translate the templates to.
   * @type {Array<string>}
   */
  this.locales = []

  /**
   * Path to the translation file to use, which can contain any of the placeholders
   * allowed on the --messageFilePathFormat option of SoyToJsSrcCompiler.jar.
   * @type {?string}
   */
  this.messageFilePathFormat = null

  /**
   * When this option is set to false, each generated JS file
   * will not attempt to declare the top-level name in its
   * namespace, instead assuming the top-level name is already
   * declared in the global scope. E.g. for namespace aaa.bbb,
   * the code will not attempt to declare aaa, but will still
   * define aaa.bbb if it's not already defined.
   * @type {boolean}
   */
  this.shouldDeclareTopLevelNamespaces = true

  /**
   * Indicates that $ij variables are used and should be passed between templates.
   * @type {boolean}
   */
  this.isUsingIjData = false
}



/**
 * Sets options which affect how soynode operates.
 */
SoyOptions.prototype.merge = function (opts) {
  for (var key in opts) {
    var isFunction = typeof this[key] == 'function'
    if (isFunction && this[key] == opts[key]) {
      continue
    }

    if (!(key in this) || (typeof this[key] == 'function')) {
      throw new Error('soynode: Invalid option key [' + key + ']')
    }

    // When setting the tmpDir make sure to resolve the absolute path so as to avoid accidents
    // caused by changes to the working directory.
    if (key == 'tmpDir') {
      this.tmpDir = path.resolve(opts.tmpDir)
    } else if (key == 'outputDir') {
      this.outputDir = opts.outputDir == null ? null : path.resolve(opts.outputDir)
    } else {
      this[key] = opts[key]
    }
  }
}

module.exports = SoyOptions
