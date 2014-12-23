// Copyright 2014. A Medium Corporation.

var fs = require('fs')
var vm = require('vm')
var closureTemplates = require('closure-templates')


/**
 * Resolved path to Soy utils JS script.
 * @type {string}
 */
var PATH_TO_SOY_UTILS = closureTemplates['soyutils.js']


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

  // Load the functions from soyutils.js into the vm context so they are available to the templates.
  vm.runInNewContext(fs.readFileSync(PATH_TO_SOY_UTILS, 'utf8'), this.getContext(), PATH_TO_SOY_UTILS)

  //load the contextJsPaths into the context before the soy template JS
  files = options.contextJsPaths.concat(files)

  var self = this
  function next() {
    if (files.length === 0) {
      // Blow away the cache when all files have been loaded
      self._templateCache = {}

      callback(null, true)
    } else {
      var path = files.pop()
      fs.readFile(path, 'utf8', function (err, fileContents) {
        if (err) return callback(err, false)
        // Evaluate the template code in the context of the soy VM context.  Any variables defined
        // in the template file will become members of the vmContext object.
        vm.runInContext(fileContents, self.getContext(), path)
        next()
      })
    }
  }
  next()
}


module.exports = SoyVmContext
