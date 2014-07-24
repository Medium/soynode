// Copyright (c)2012 The Obvious Corporation

/**
 * @fileoverview Public interface exposed to users of `soynode`.
 */

var exec = require('child_process').exec
var spawn = require('child_process').spawn
var fs = require('fs')
var path = require('path')
var vm = require('vm')
var closureTemplates = require('closure-templates')
var EventEmitter = require('events').EventEmitter


// Public API.  See function declarations for JSDoc.
module.exports = {
    setOptions: setOptions
  , get: get
  , render: render
  , compileTemplates: compileTemplates
  , compileTemplateFiles: compileTemplateFiles
  , loadCompiledTemplates: loadCompiledTemplates
  , loadCompiledTemplateFiles: loadCompiledTemplateFiles
}


/**
 * Resolved path to the executable jar for the Closure Template compiler.
 * @type {string}
 */
var PATH_TO_SOY_JAR = closureTemplates['SoyToJsSrcCompiler.jar']


/**
 * Resolved path to Soy utils JS script.
 * @type {string}
 */
var PATH_TO_SOY_UTILS = closureTemplates['soyutils.js']


/**
 * VM Context that is used as the global when fetching templates.  The end result is that this
 * object contains references to the JS functions rendered by Soy.
 * @type {Object}
 */
var vmContext = vm.createContext({})


/**
 * A cache for function pointers returned by the vm.runInContext call.  Caching the reference
 * results in a 10x speed improvement, over calling getting the function each time.
 * @type {Object}
 */
var templateCache = {}


/**
 * Map of filenames that have a watch to the last time it was called.
 * @param {Object.<number>}
 */
var watches = {}


/**
 * Default options that can be overridden by setOptions
 */
var options = {
    // A temporary directory where compiled .soy.js files will be stored after compilation.
    tmpDir: '/tmp/soynode'

    // Directory where the compiler will spawn compilation process.
      // When compiling from files defaults to process.cwd(), if compiling from a directory inputDir is used instead.
  , inputDir: process.cwd()

    //An output directory, which compiled soy.js files is stored.
  , outputDir: null

    // Whether the compiled soy files should be placed into a unique directory(timestamped).
  , uniqueDir: true

    // Whether to watch any files that are loaded and to refetch them when they change.
  , allowDynamicRecompile: false

  // Whether or not to load the compiled templates in the VM context.
  , loadCompiledTemplates: true

    // Whether to delete temporary files created during the compilation process.
  , eraseTemporaryFiles: false

    // Whether or not to use goog.provide and goog.require for JS functions and Soy namespaces.
  , useClosureStyle: false

    // Additional classpath to pass to the soy template compiler. This makes adding plugins possible.
  , classpath: [ ]

    // Plugin module Java classnames to pass to the soy template compiler.
  , pluginModules: [ ]

    // Additional JS files to be evaluated in the VM context for the soy templates.
        // Useful for soy function support libs
  , contextJsPaths: [ ]

    // Whether the compiled soy.js files should be joined into a single file
  , concatOutput: false

    // File name used for concatenated files, only relevant when concatOutput is true.
  , concatFileName: 'compiled'
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
function setOptions(opts) {
  for (var key in opts) {
    if (!(key in options)) {
      throw new Error('soynode: Invalid option key [' + key + ']')
    }
    // When setting the tmpDir make sure to resolve the absolute path so as to avoid accidents
    // caused by changes to the working directory.
    if (key == 'tmpDir') options['tmpDir'] = path.resolve(opts['tmpDir'])
    else if (key == 'outputDir') options['outputDir'] = path.resolve(opts['outputDir'])
    else options[key] = opts[key]
  }
}


/**
 * Resolves the output directory from the current options.
 * @return {string}
 */
function getOutputDir(opts) {
  var dir = options.outputDir || options.tmpDir
  if (options.uniqueDir !== false) {
    var timeDirectory = new Date().toISOString().replace(/\:/g, '_')
    dir = path.join(dir, timeDirectory)
  }
  return dir
}


/**
 * Gets a reference to a template function.
 *
 * Note: If dynamic recompilation is enabled the reference will not get updated.
 *
 * @param {string} templateName
 * @return {function (Object) : string}
 */
function get(templateName) {
  if (!options.loadCompiledTemplates) throw new Error('soynode: Cannot load template, try with `loadCompiledTemplates: true`.')
  if (!templateCache[templateName]) {
    var template
    try {
      template = vm.runInContext(templateName, vmContext, 'soynode.vm')
    } catch (e) {}

    if (!template) throw new Error('soynode: Unknown template [' + templateName + ']')
    templateCache[templateName] = template
  }
  return templateCache[templateName]
}


/**
 * Renders a template using the provided data and returns the resultant string.
 * @param {string} templateName
 * @param {Object=} data
 * @param {Object=} injectedData optional injected data available via $ij
 * @return {string}
 */
function render(templateName, data, injectedData) {
  return get(templateName)(data, null, injectedData)
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
function compileTemplates(inputDir, callback) {
  var emitter = new EventEmitter()
  if (options.allowDynamicRecompile) {
    emitter.on('compile', logErrorOrDone)
  }
  if (callback) {
    emitter.once('compile', callback)
  }
  compileTemplatesAndEmit(inputDir, emitter)
  return emitter
}

/**
 * Compiles all soy files within the provided array and loads them into memory.  The callback
 * will be called when templates are ready, or an error occurred along the way.
 * @param {Array.<string>} files
 * @param {function (Error, boolean)=} callback
 * @return {EventEmitter} An EventEmitter that publishes a "compile" event after every compile.
 */
function compileTemplateFiles(files, callback) {
  var emitter = new EventEmitter()
  if (callback) {
    emitter.once('compile', callback)
  }
  compileTemplateFilesAndEmit(files, emitter)
  return emitter
}


/**
 * Compiles all soy files, but takes an emitter to use instead of a callback.
 * @see compileTemplates for the emitter API.
 * @param {Array.<string>} files
 * @param {EventEmitter} emitter
 */
function compileTemplateFilesAndEmit(files, emitter) {
  var outputDir = getOutputDir()

  if (files.length == 0) return emitter.emit('compile', null, true)

  if (options.allowDynamicRecompile) {
    // Set up a watch for changes to files.  Currently this will recompile all templates when
    // ever one changes. TODO(dan): Make this compile individual files.
    var filePaths = files.map(function (file) { return path.resolve(options.inputDir, file) })
    watchFiles(filePaths, compileTemplateFilesAndEmit.bind(null, files, emitter))
  }

  // Arguments for running the soy compiler via java.
  var args = [
      '-classpath', [ PATH_TO_SOY_JAR ].concat(options.classpath).join(path.delimiter)
    , 'com.google.template.soy.SoyToJsSrcCompiler'
    , '--codeStyle', 'concat'
    , '--shouldGenerateJsdoc'
    , '--outputPathFormat', outputDir + '/{INPUT_DIRECTORY}{INPUT_FILE_NAME}.js'
  ]
  if (options.useClosureStyle) {
    args.push('--shouldProvideRequireSoyNamespaces')
  }
  args = args.concat(files)
  if (options.pluginModules && options.pluginModules.length > 0) {
      args.push('--pluginModules', options.pluginModules.join(','))
  }

  // Execute the comamnd inside the input directory.
  var cp = spawn('java', args, {cwd: options.inputDir})

  var stderr = ''
  cp.stderr.on('data', function (data) {
    stderr += data
  })

  cp.on('exit', function (exitCode) {
    if (exitCode != 0) {
      // Log all the errors and execute the callback with a generic error object.
      console.error('soynode: Compile error\n', stderr)
      emitter.emit('compile', new Error('Error compiling templates'), false)
    } else {

      // Build a list of paths that we expect as output of the soy compiler.
      var templatePaths = files.map(function (file) {
        return path.join(outputDir , file) + '.js'
      })

      try {
        if (options.concatOutput) concatOutput(outputDir, templatePaths)
      } catch (e) {
        console.warn('soynode: Error concatenating files', e)
      }

      if (options.loadCompiledTemplates) {
        // Load the compiled templates into memory.
        loadCompiledTemplateFiles(templatePaths, function (err) {
          if (err) return emitter.emit('compile', err, false)
          finalizeCompileTemplates(emitter)
        })
      } else {
        finalizeCompileTemplates(emitter)
      }
    }
  })
};

/**
 * Compiles all soy files from an input directory, but takes an emitter to use
 * instead of a callback.
 * @see compileTemplates for the emitter API.
 * @param {string} inputDir
 * @param {EventEmitter} emitter
 */
function compileTemplatesAndEmit(inputDir, emitter) {
  // Compiling from a directory, make sure to spawn from here.
  options.inputDir = inputDir;

  findFiles(inputDir, 'soy', function (err, files) {
    if (err) return emitter.emit('compile', err, false)
    if (files.length == 0) return emitter.emit('compile', null, true)

    compileTemplateFilesAndEmit(files, emitter)
  })
}


/**
 * Finalizes compile templates.
 * @param {EventEmitter} emitter
 */
function finalizeCompileTemplates(emitter) {
  emitter.emit('compile', null, true)

  if (options.eraseTemporaryFiles) {
    var outputDir = getOutputDir()
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
function loadCompiledTemplates(inputDir, callback) {
  findFiles(inputDir, 'soy.js', function (err, files) {
    if (err) return callback(err, false)
    files = files.map(function (file) { return path.join(inputDir, file) })
    loadCompiledTemplateFiles(files, callback)
  })
}


/**
 * Loads an array of template files into memory.
 * @param {Array.<string>} files
 * @param {function (Error, boolean)} callback
 */
function loadCompiledTemplateFiles(files, callback) {

  // Load the functions from soyutils.js into the vm context so they are available to the templates.
  vm.runInNewContext(fs.readFileSync(PATH_TO_SOY_UTILS, 'utf8'), vmContext, PATH_TO_SOY_UTILS)

  //load the contextJsPaths into the context before the soy template JS
  files = options.contextJsPaths.concat(files)

  function next() {
    if (files.length === 0) {
      // Blow away the cache when all files have been loaded
      templateCache = {}

      callback(null, true)
    } else {
      var path = files.pop()
      fs.readFile(path, 'utf8', function (err, fileContents) {
        if (err) return callback(err, false)
        // Evaluate the template code in the context of the soy VM context.  Any variables defined
        // in the template file will become members of the vmContext object.
        vm.runInContext(fileContents, vmContext, path)
        next()
      })
    }
  }
  next()
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
 * Adds a file system watch to the provided files, and executes the fn when changes are detected.
 * @param {Array.<string>} files
 * @param {Function} fn
 */
function watchFiles(files, fn) {
  files.forEach(function (file) {
    if (watches[file]) return
    try {
      watches[file] = Date.now()
      fs.watchFile(file, {}, function (event, filename) {
        var now = Date.now()
        // Ignore spurious change events.
        if (now - watches[file] < 1000) return
        console.log('soynode: Recompiling templates due to change in [%s]', file)
        watches[file] = now
        fn()
      })
    } catch (e) {
     console.warn('soynode: Error watching ' + file, e)
    }
  })
}

/**
 * Concatenates all output files into a single file.
 * @param {string} outputDir
 * @param {Array.<string>} files
 */
function concatOutput(outputDir, files) {
  var target = path.join(outputDir, options.concatFileName + '.soy.concat.js')
  var concatenated = files.map(function (file) {
    return fs.readFileSync(file).toString()
  }).join('')

  fs.writeFileSync(target, concatenated)
}


/**
 * Callback that will log an error.
 */
function logErrorOrDone(err, res) {
  if (err) console.error('soynode:', err)
  else console.log('soynode: Done')
}
