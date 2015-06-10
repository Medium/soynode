// Copyright 2014. A Medium Corporation.

var Q = require('q')
var fs = require('fs')
var vm = require('vm')
var path = require('path')
var closureTemplates = require('closure-templates')
var closureLibrary = require('obvious-closure-library')


/**
 * Resolved path to Soy utils JS script.
 * @type {string}
 */
var SOY_UTILS_PATH = closureTemplates['soyutils_usegoog.js']

/**
 * All the dependencies of soyutils_usegoog.js
 *
 * In theory, it'd be more robust to load these with goog.require
 * but I haven't figured out how to make the bootstrapping work
 * in the VM environment.
 */
var CLOSURE_PATHS = [
  "closure/goog/base.js",
  "closure/goog/deps.js",
  "closure/goog/debug/error.js",
  "closure/goog/dom/nodetype.js",
  "closure/goog/string/string.js",
  "closure/goog/asserts/asserts.js",
  "closure/goog/array/array.js",
  "closure/goog/dom/tagname.js",
  "closure/goog/object/object.js",
  "closure/goog/dom/tags.js",
  "closure/goog/string/typedstring.js",
  "closure/goog/string/const.js",
  "closure/goog/html/safestyle.js",
  "closure/goog/html/safestylesheet.js",
  "closure/goog/fs/url.js",
  "closure/goog/i18n/bidi.js",
  "closure/goog/html/safeurl.js",
  "closure/goog/html/trustedresourceurl.js",
  "closure/goog/html/safehtml.js",
  "closure/goog/html/safescript.js",
  "closure/goog/html/uncheckedconversions.js",
  "closure/goog/structs/structs.js",
  "closure/goog/structs/collection.js",
  "closure/goog/functions/functions.js",
  "closure/goog/math/math.js",
  "closure/goog/iter/iter.js",
  "closure/goog/structs/map.js",
  "closure/goog/structs/set.js",
  "closure/goog/labs/useragent/util.js",
  "closure/goog/labs/useragent/browser.js",
  "closure/goog/labs/useragent/engine.js",
  "closure/goog/labs/useragent/platform.js",
  "closure/goog/useragent/useragent.js",
  "closure/goog/debug/debug.js",
  "closure/goog/dom/browserfeature.js",
  "closure/goog/dom/safe.js",
  "closure/goog/math/coordinate.js",
  "closure/goog/math/size.js",
  "closure/goog/dom/dom.js",
  "closure/goog/structs/inversionmap.js",
  "closure/goog/i18n/graphemebreak.js",
  "closure/goog/format/format.js",
  "closure/goog/html/legacyconversions.js",
  "closure/goog/i18n/bidiformatter.js",
  "closure/goog/soy/data.js",
  "closure/goog/soy/soy.js",
  "closure/goog/string/stringbuffer.js"
].map(function (file) {
  return path.join(closureLibrary.dirname, file)
})


/**
 * Closure-templates keeps a global registry of all deltemplates.
 * We want to be able to reset the registry when we recompile.
 *
 * This is kind of a terrible solution, but it seems faster and more
 * robust than trying to reload all the support code every time.
 */
var RESET_DELTEMPLATE_REGISTRY_CODE =
    'soy.$$DELEGATE_REGISTRY_PRIORITIES_ = {};\n' +
    'soy.$$DELEGATE_REGISTRY_FUNCTIONS_ = {};'


/**
 * An abstract API over a soynode VM context.
 *
 * SoyNode operates by creating a VM sandbox, and loading the soy functions into
 * that sandbox. If you use SoyNode's i18n features, you may have multiple sandboxes,
 * one for each locale.
 *
 * @param {string} name
 * @param {SoyOptions} options
 * @constructor
 */
function SoyVmContext(name, options) {
  /** @private {string} */
  this._name = name

  /** @private {SoyOptions} */
  this._options = options

  /**
   * A cache for function pointers returned by the vm.runInContext call.  Caching the reference
   * results in a 10x speed improvement, over calling getting the function each time.
   * @type {Object}
   */
  this._templateCache = {}

  this._context = vm.createContext({});

  /** @private {boolean} Whether the context has been initialized with soyutils */
  this._contextInitialized = false
}


/**
 * The unique name of the sandbox.
 * @return {string}
 */
SoyVmContext.prototype.getName = function () {
  return this._name
}


/**
 * The unique name of the sandbox.
 * @return {Object}
 */
SoyVmContext.prototype.getContext = function () {
  return this._context
}


/**
 * Gets a reference to a template function.
 *
 * Note: If dynamic recompilation is enabled the reference will not get updated.
 *
 * @param {string} templateName
 * @return {function (Object) : string}
 */
SoyVmContext.prototype.get = function (templateName) {
  if (!this._options.loadCompiledTemplates) throw new Error('soynode: Cannot load template, try with `loadCompiledTemplates: true`.')

  if (!this._templateCache[templateName]) {
    var template
    try {
      template = vm.runInContext(templateName, this.getContext(), 'soynode.vm')
    } catch (e) {}

    if (!template) throw new Error('soynode: Unknown template [' + templateName + ']')
    this._templateCache[templateName] = template
  }
  return this._templateCache[templateName]
}


/**
 * Loads an array of template files into memory.
 * @param {Array.<string>} files
 * @param {function (Error, boolean)=} callback
 */
SoyVmContext.prototype.loadCompiledTemplateFiles = function (files, callback) {
  var options = this._options
  var self = this

  // load the contextJsPaths into the context before the soy template JS
  var filePromises = pathsToPromises(options.contextJsPaths.concat(files))
  var supportFilePromises = getSupportFilePromises()

  var result = Q.resolve(true)
  if (self._contextInitialized) {
    result = Q.fcall(function () {
      vm.runInContext(RESET_DELTEMPLATE_REGISTRY_CODE, self.getContext(), 'soynode-reset.')
    })
  } else {
    result = result.then(function () {
      return loadFiles(self.getContext(), supportFilePromises)
    }).then(function () {
      self._contextInitialized = true
    })
  }

  result.then(function () {
    return loadFiles(self.getContext(), filePromises)
  })
  .then(function (result) {
    // Blow away the cache when all files have been loaded
    self._templateCache = {}
    callback(null, result)
  }, function (err) {
    callback(err)
  })
}

/**
 * @param {VmContext} context a vm context
 * @param {Array.<Promise>} filePromises Promises of {path, contents} tuples
 * @return {Q.Promise}
 */
function loadFiles(context, filePromises) {
  var i = 0

  function next(result) {
    // Evaluate the template code in the context of the soy VM context.  Any variables defined
    // in the template file will become members of the vmContext object.
    vm.runInContext(result.contents, context, result.path)

    if (i >= filePromises.length) {
      return Q.resolve(true)
    } else {
      return filePromises[i++].then(next)
    }
  }

  if (!filePromises.length) {
    return Q.resolve(true)
  }
  return filePromises[i++].then(next)
}

var supportFilePromises = null

/**
 * @return {Array.<Promise.<string>>} Promises for the file contents of closure/soy support code.
 */
function getSupportFilePromises() {
  if (supportFilePromises) return supportFilePromises

  var paths = CLOSURE_PATHS.concat([SOY_UTILS_PATH])
  supportFilePromises = pathsToPromises(paths)
  return supportFilePromises
}

function pathsToPromises(paths) {
  return paths.map(function (path) {
    return Q.nfcall(fs.readFile, path, 'utf8').then(function (contents) {
      return {path: path, contents: contents}
    })
  })
}

module.exports = SoyVmContext
