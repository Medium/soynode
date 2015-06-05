// Copyright 2014. A Medium Corporation.

var SoyOptions = require('./SoyOptions')
var SoyVmContext = require('./SoyVmContext')

var EventEmitter = require('events').EventEmitter
var child_process = require('child_process')
var exec = child_process.exec
var closureTemplates = require('closure-templates')
var fs = require('fs')
var path = require('path')


/**
 * The key in vmContexts for the default vm context (with no locale).
 */
var DEFAULT_VM_CONTEXT = 'default'


/**
 * Resolved path to the executable jar for the Closure Template compiler.
 * @type {string}
 */
var PATH_TO_SOY_JAR = closureTemplates['SoyToJsSrcCompiler.jar']


/**
 * The main public API of soynode.
 * @constructor
 */
function SoyCompiler() {
  /** @private {SoyOptions} */
  this._options = this.getDefaultOptions()

  /**
   * VM Context that is used as the global when fetching templates.  The end result is that this
   * object contains references to the JS functions rendered by Soy.
   * @type {Object.<string, SoyVmContext>}
   */
  this._vmContexts = {}

  /**
   * Map of filenames that have a watch to the last time it was called.
   * @param {Object.<number>}
   */
  this._watches = {}
}


/** @return {SoyOptions} */
SoyCompiler.prototype.getDefaultOptions = function () {
  return new SoyOptions()
}


/**
 * Sets options which affect how soynode operates.
 * @param {{
 *     tmpDir: string=, //Deprecated
 *     outputDir: string=,
 *     uniqueDir: boolean=,
 *     allowDynamicRecompile: boolean=,
 *     eraseTemporaryFiles: boolean=}}} opts
 */
SoyCompiler.prototype.setOptions = function (opts) {
  this._options.merge(opts)
}


/**
 * Gets a reference to a template function.
 *
 * Note: If dynamic recompilation is enabled the reference will not get updated.
 *
 * @param {string} templateName
 * @param {string=} vmType optional type of the vm
 * @return {function (Object) : string}
 */
SoyCompiler.prototype.get = function (templateName, vmType) {
  return this.getSoyVmContext(vmType || DEFAULT_VM_CONTEXT).get(templateName)
}


/**
 * Renders a template using the provided data and returns the resultant string.
 * @param {string} templateName
 * @param {Object=} data
 * @param {Object=} injectedData optional injected data available via $ij
 * @param {string=} vmType optional type of the vm
 * @return {string}
 */
SoyCompiler.prototype.render = function (templateName, data, injectedData, vmType) {
  // Certain autoescape modes of closure-templates return a Content object
  // instead of a string, so force a string.
  return String(this.get(templateName, vmType)(data, null, injectedData))
}



/**
 * Gets the SoyVmContext object for the for the given locale, or the default if no locale is given.
 *
 * @param {string=} vmType optional type of the vm
 */
SoyCompiler.prototype.getSoyVmContext = function (vmType) {
  vmType = vmType || DEFAULT_VM_CONTEXT;

  if (!this._vmContexts[vmType]) {
    this._vmContexts[vmType] = new SoyVmContext(vmType, this._options);
  }

  return this._vmContexts[vmType];
}



/**
 * Gets the vm context for the given locale, or the default if no locale is given.
 *
 * @param {string=} vmType optional type of the vm
 * @return {Object}
 */
SoyCompiler.prototype.getVMContext = function (vmType) {
  return this.getSoyVmContext(vmType).getContext();
}


/**
 * Compiles all soy files within the provided directory and loads them into memory.  The callback
 * will be called when templates are ready, or an error occurred along the way.
 * @param {string} inputDir
 * @param {function (Error, boolean)=} callback
 * @return {EventEmitter} An EventEmitter that publishes a "compile" event after every compile
 *     This is particularly useful if you have allowDynamicRecompile on, so that your server
 *     can propagate the error appropriately. The "compile" event has two arguments: (error, success).
 */
SoyCompiler.prototype.compileTemplates = function (inputDir, callback) {
  var options = this._options
  var emitter = new EventEmitter()
  if (options.allowDynamicRecompile) {
    emitter.on('compile', logErrorOrDone)
  }
  if (callback) {
    emitter.once('compile', callback)
  }
  this._compileTemplatesAndEmit(inputDir, emitter)
  return emitter
}


/**
 * Compiles all soy files within the provided array and loads them into memory.  The callback
 * will be called when templates are ready, or an error occurred along the way.
 * @param {Array.<string>} files
 * @param {function (Error, boolean)=} callback
 * @return {EventEmitter} An EventEmitter that publishes a "compile" event after every compile.
 */
SoyCompiler.prototype.compileTemplateFiles = function (files, callback) {
  var emitter = new EventEmitter()
  if (callback) {
    emitter.once('compile', callback)
  }
  this._compileTemplateFilesAndEmit(this._options.inputDir, files, emitter)
  return emitter
}


/**
 * Resolves the output directory from the current options.
 * @return {string}
 * @private
 */
SoyCompiler.prototype._getOutputDir = function () {
  var options = this._options
  var dir = options.outputDir || options.tmpDir
  if (options.uniqueDir !== false) {
    var timeDirectory = new Date().toISOString().replace(/\:/g, '_')
    dir = path.join(dir, timeDirectory)
  }
  return dir
}


/**
 * Compiles all soy files, but takes an emitter to use instead of a callback.
 * @see compileTemplates for the emitter API.
 * @param {string} inputDir Input directory from where the compiler spawns.
 * @param {Array.<string>} files
 * @param {EventEmitter} emitter
 * @private
 */
SoyCompiler.prototype._compileTemplateFilesAndEmit = function (inputDir, files, emitter) {
  var options = this._options
  var outputDir = this._getOutputDir()
  var outputPathFormat = outputDir + '/{INPUT_DIRECTORY}{INPUT_FILE_NAME}.js'

  if (files.length == 0) return emitter.emit('compile', null, true)

  if (options.allowDynamicRecompile) {
    // Set up a watch for changes to files.  Currently this will recompile all templates when
    // ever one changes. TODO(dan): Make this compile individual files.
    var filePaths = files.map(function (file) { return path.resolve(inputDir, file) })
    this._watchFiles(filePaths, this._compileTemplateFilesAndEmit.bind(this, inputDir, files, emitter))
  }

  // Arguments for running the soy compiler via java.
  var args = [
    '-classpath', [ PATH_TO_SOY_JAR ].concat(options.classpath).join(path.delimiter),
    'com.google.template.soy.SoyToJsSrcCompiler',
    '--codeStyle', 'concat',
    '--shouldGenerateJsdoc',
  ]
  if (options.useClosureStyle) {
    args.push('--shouldProvideRequireSoyNamespaces')
  }
  if (options.cssHandlingScheme !== undefined) {
    args.push('--cssHandlingScheme', options.cssHandlingScheme);
  }
  args = args.concat(files)
  if (options.pluginModules && options.pluginModules.length > 0) {
    args.push('--pluginModules', options.pluginModules.join(','))
  }

  if (options.locales && options.locales.length > 0) {
    args.push('--locales', options.locales.join(','))

    if (options.locales.length > 1) {
      outputPathFormat = outputDir + '/{INPUT_DIRECTORY}{INPUT_FILE_NAME_NO_EXT}_{LOCALE}.soy.js'
    }
  }

  if (options.messageFilePathFormat) {
    args.push('--messageFilePathFormat', options.messageFilePathFormat)
  }

  if (!options.shouldDeclareTopLevelNamespaces) {
    args.push('--shouldDeclareTopLevelNamespaces', 'false');
  }

  // Always turn on isUsingIjData.
  // https://groups.google.com/forum/#!topic/closure-templates-discuss/8rxD9I0QrtI
  args.push('--isUsingIjData')

  args.push('--outputPathFormat', outputPathFormat)

  // Execute the command inside the input directory.
  var cp = child_process.spawn('java', args, {cwd: inputDir})

  var stderr = ''
  cp.stderr.on('data', function (data) {
    stderr += data
  })

  var terminated = false
  var self = this

  function onExit(exitCode) {
    if (terminated) return

    if (exitCode != 0) {
      // Log all the errors and execute the callback with a generic error object.
      terminated = true
      console.error('soynode: Compile error\n', stderr)
      emitter.emit('compile', new Error('Error compiling templates'), false)
    } else {

      var vmTypes = [DEFAULT_VM_CONTEXT];
      if (options.locales && options.locales.length > 0) {
        vmTypes = options.locales.concat()
      }

      var next = function () {
        if (vmTypes.length === 0) {
          self._finalizeCompileTemplates(outputDir, emitter)
        } else {
          self._postCompileProcess(outputDir, files, vmTypes.pop(), function(err) {
            if (err) return emitter.emit('compile', err, false)
            next()
          })
        }
      }
      next()
    }
  }

  cp.on('error', function (err) {
    stderr += String(err)
    onExit(1)
  })

  cp.on('exit', onExit)
};


/**
 * Compiles all soy files from an input directory, but takes an emitter to use
 * instead of a callback.
 * @see compileTemplates for the emitter API.
 * @param {string} inputDir
 * @param {EventEmitter} emitter
 * @private
 */
SoyCompiler.prototype._compileTemplatesAndEmit = function (inputDir, emitter) {
  var self = this
  findFiles(inputDir, 'soy', function (err, files) {
    if (err) return emitter.emit('compile', err, false)
    if (files.length == 0) return emitter.emit('compile', null, true)

    self._compileTemplateFilesAndEmit(inputDir, files, emitter)
  })
}


/**
 * Finalizes compile templates.
 * @param {EventEmitter} emitter
 * @private
 */
SoyCompiler.prototype._finalizeCompileTemplates = function (outputDir, emitter) {
  emitter.emit('compile', null, true)

  if (this._options.eraseTemporaryFiles) {
    exec('rm -r \'' + outputDir + '\'', {}, function (err, stdout, stderr) {
      // TODO(dan): This is a pretty nasty way to delete the files.  Maybe use rimraf
      if (err) console.error('soynode: Error deleting temporary files', err)
    })
  }
};


/**
 * Loads precompiled templates into memory.  All .soy.js files within the provided inputDir will be
 * loaded.
 * @param {string} inputDir
 * @param {function (Error, boolean)}
 */
SoyCompiler.prototype.loadCompiledTemplates = function(inputDir, callback) {
  var self = this
  findFiles(inputDir, 'soy.js', function (err, files) {
    if (err) return callback(err, false)
    files = files.map(function (file) { return path.join(inputDir, file) })
    self.loadCompiledTemplateFiles(files, callback)
  })
}


/**
 * Loads an array of template files into memory.
 * @param {Array.<string>} files
 * @param {function (Error, boolean) | Object} callbackOrOptions
 * @param {function (Error, boolean)=} callback
 */
SoyCompiler.prototype.loadCompiledTemplateFiles = function (files, callbackOrOptions, callback) {
  var options = this._options
  var vmType = DEFAULT_VM_CONTEXT

  if (typeof(callbackOrOptions) === 'function') {
    callback = callbackOrOptions
  } else {
    vmType = callbackOrOptions.vmType
  }

  this.getSoyVmContext(vmType).loadCompiledTemplateFiles(files, callback)
}


/**
 * Adds a file system watch to the provided files, and executes the fn when changes are detected.
 * @param {Array.<string>} files
 * @param {Function} fn
 * @private
 */
SoyCompiler.prototype._watchFiles = function (files, fn) {
  files.forEach(function (file) {
    if (this._watches[file]) return
    try {
      this._watches[file] = Date.now()

      fs.watchFile(file, {}, function (event, filename) {
        var now = Date.now()
        // Ignore spurious change events.
        if (now - this._watches[file] < 1000) return
        console.log('soynode: Recompiling templates due to change in [%s]', file)
        this._watches[file] = now
        fn.call(this)
      }.bind(this))
    } catch (e) {
      console.warn('soynode: Error watching ' + file, e)
    }
  }, this)
}


/**
 * Concatenates all output files into a single file.
 * @param {string} outputDir
 * @param {Array.<string>} files
 * @param {string=} vmType optional type of the vm
 * @private
 */
SoyCompiler.prototype._concatOutput = function (outputDir, files, vmType) {
  var options = this._options
  var concatFileName = options.concatFileName;
  if (options.locales && options.locales.length > 1) {
    concatFileName += '_' + vmType;
  }
  concatFileName += '.soy.concat.js'

  var target = path.join(outputDir, concatFileName)
  var concatenated = files.map(function (file) {
    return fs.readFileSync(file).toString()
  }).join('')

  fs.writeFileSync(target, concatenated)
}


/**
 * Does all processing that happens after the compiling ends.
 * @param {string} outputDir
 * @param {Array.<string>} files
 * @param {string=} vmType optional type of the vm
 * @param {function (Error, boolean)} callback
 * @private
 */
SoyCompiler.prototype._postCompileProcess = function (outputDir, files, vmType, callback) {
  var options = this._options
  vmType = vmType || DEFAULT_VM_CONTEXT

  // Build a list of paths that we expect as output of the soy compiler.
  var currentPath
  var templatePaths = files.map(function (file) {
    currentPath = path.join(outputDir , file) + '.js'

    if (options.locales && options.locales.length > 1) {
      currentPath = currentPath.replace(/.soy.js/, '_' + vmType + '.soy.js')
    }

    return currentPath
  })

  try {
    if (options.concatOutput) this._concatOutput(outputDir, templatePaths, vmType)
  } catch (e) {
    console.warn('soynode: Error concatenating files', e)
  }

  if (options.loadCompiledTemplates) {
    // Load the compiled templates into memory.
    this.loadCompiledTemplateFiles(templatePaths, {vmType: vmType}, callback)
  } else {
    callback()
  }
}


/**
 * Performs a recursive directory traversal of the given directory, accumulating all files with the
 * provided extension.  The resultant array is a list of paths relative to the input directory.
 * @param {string} directory
 * @param {string} extension
 * @param {function(Error, Array.<string>)} callback
 */
function findFiles(directory, extension, callback) {
  var files = []
  var stack = [directory]

  function next() {
    if (stack.length === 0) {
      callback(null, files)
    } else {
      var dir = stack.pop()
      fs.stat(dir, function (err, stats) {
        if (err) return callback(err, [])
        if (!stats.isDirectory()) return next()
        fs.readdir(dir, function (err, dirContents) {
          if (err) return callback(err, [])
          dirContents.forEach(function (file) {
            var fullpath = path.join(dir, file)
            // If the file is a soy file then push it onto the files array.
            if (file.substr(-1 - extension.length) == '.' + extension) {
              files.push(path.relative(directory, fullpath))

            // If the file has no extension add it to the stack for potential processing. We
            // optimistically add potential dirs here to simplify the async nature of fs calls.
            } else if (file.indexOf('.') == -1) {
              stack.push(fullpath)
            }
          })
          next()
        })
      })
    }
  }
  next()
}


/**
 * Callback that will log an error.
 */
function logErrorOrDone(err, res) {
  if (err) console.error('soynode:', err)
  else console.log('soynode: Done')
}

module.exports = SoyCompiler
