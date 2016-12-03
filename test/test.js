'use strict';

var child_process = require('child_process')
var fs = require('fs-extra');
var path = require('path');
var soynode = require('../lib/soynode.js');
var nodeunitq = require('nodeunitq')
var builder = new nodeunitq.Builder(exports)
var Q = require('q')

var watchFile = fs.watchFile
var now = Date.now
var spawn = child_process.spawn

var watchFiles
var watchCallbacks
var spawnOpts
var spawnArgs
var time
var soyCompiler
var tmpDir1 = path.join(__dirname, 'tmp1')

exports.setUp = function (done) {
  soyCompiler = new soynode.SoyCompiler()

  time = 1
  Date.now = function () { return time; }

  watchFiles = [];
  watchCallbacks = [];
  fs.watchFile = function (f, opts, callback) {
    watchFiles.push(f);
    watchCallbacks.push(callback);
  };

  spawnOpts = []
  spawnArgs = []
  child_process.spawn = function (prog, args, opts) {
    spawnOpts.push(opts)
    spawnArgs.push(args)
    return spawn.apply(child_process, arguments)
  }
  done()
}

exports.tearDown = function (done) {
  Date.now = now;
  fs.watchFile = watchFile;
  fs.removeSync(tmpDir1)
  child_process.spawn = spawn;
  done();
}

builder.add(function testCompileTemplates(test) {
  soyCompiler.compileTemplates(__dirname + '/assets', function(err) {
    test.ifError(err);
    test.doesNotThrow(assertTemplatesContents.bind(null, test));
    test.done();
  });
})

builder.add(function testCompileTemplatesWatch(test) {
  soyCompiler.setOptions({allowDynamicRecompile: true})
  return Q.nfcall(soyCompiler.compileTemplates.bind(soyCompiler), __dirname + '/assets').then(function () {
    test.deepEqual(['template1.soy', 'template2.soy', 'template3.soy'], watchFiles.map(function (f) {
      return path.basename(f)
    }))
    test.deepEqual([{cwd: __dirname + '/assets'}], spawnOpts)

    var args = spawnArgs[0]
    test.deepEqual(['template1.soy', 'template2.soy', 'template3.soy'],
                   args.slice(args.length - 3, args.length))

    time += 1000
    return Q.delay(1)
  }).then(function () {
    return watchCallbacks[1]()
  }).then(function () {
    test.deepEqual(['template1.soy', 'template2.soy', 'template3.soy'], watchFiles.map(function (f) {
      return path.basename(f)
    }))
    test.deepEqual([{cwd: __dirname + '/assets'}, {cwd: __dirname + '/assets'}], spawnOpts)

    var args = spawnArgs[1]
    var secondLastArg = args[args.length - 2]
    test.ok(secondLastArg.indexOf('/tmp/soynode') == 0)

    var lastArg = args[args.length - 1]
    test.equal('template2.soy', lastArg)
  })
})

builder.add(function testCompileTemplatesWatchDelTemplate(test) {
  soyCompiler.setOptions({allowDynamicRecompile: true})
  return Q.nfcall(soyCompiler.compileTemplates.bind(soyCompiler), __dirname + '/assets').then(function () {
    test.equal('The default template', soyCompiler.render('template3.main', {}))
    test.equal('Hello world', soyCompiler.render('template3.main', {type: 'hello'}))
    test.equal('The default template', soyCompiler.render('template3.main', {type: 'goodbye'}))

    time += 1000
    return Q.delay(1)
  }).then(function () {
    return watchCallbacks[1]()
  }).then(function () {
    test.equal('The default template', soyCompiler.render('template3.main', {}))
    test.equal('Hello world', soyCompiler.render('template3.main', {type: 'hello'}))
    test.equal('The default template', soyCompiler.render('template3.main', {type: 'goodbye'}))
  });
})

builder.add(function testCompileTemplateFiles(test) {
  soyCompiler.compileTemplateFiles([__dirname + '/assets/template1.soy', __dirname + '/assets/template2.soy'], function(err) {
    test.ifError(err);
    test.doesNotThrow(assertTemplatesContents.bind(null, test));
    test.done();
  });
})

builder.add(function testCompileTemplateFilesRelativePath(test) {
  soyCompiler.setOptions({ inputDir: __dirname });
  soyCompiler.compileTemplateFiles(['./assets/template1.soy', './assets/template2.soy'], function(err) {
    test.ifError(err);
    test.doesNotThrow(assertTemplatesContents.bind(null, test));
    test.done();
  });
})

builder.add(function testCompileAndTranslateTemplates(test) {
  soyCompiler.setOptions({
    locales: ['pt-BR'],
    messageFilePathFormat: __dirname + '/assets/translations_pt-BR.xlf'
  });
  soyCompiler.compileTemplates(__dirname + '/assets', function(err) {
    test.ifError(err);
    test.doesNotThrow(assertTemplatesContents.bind(null, test, 'pt-BR'));
    test.done();
  });
})

builder.add(function testCompileAndTranslateMultipleLanguagesTemplates(test) {
  soyCompiler.setOptions({
    locales: ['pt-BR', 'es'],
    messageFilePathFormat: __dirname + '/assets/translations_{LOCALE}.xlf'
  });
  soyCompiler.compileTemplates(__dirname + '/assets', function(err) {
    test.ifError(err);
    test.doesNotThrow(assertTemplatesContents.bind(null, test, 'pt-BR'));
    test.doesNotThrow(assertTemplatesContents.bind(null, test, 'es'));
    test.done();
  });
})

builder.add(function testDefaultShouldDeclareTopLevelNamespaces(test) {
  soyCompiler.setOptions({
    uniqueDir: false
  });
  soyCompiler.compileTemplateFiles([__dirname + '/assets/template1.soy'], function(err) {
    test.ifError(err);

    var soyJsFilePath = path.join('/tmp/soynode', __dirname, 'assets/template1.soy.js');
    var contents = fs.readFileSync(soyJsFilePath, 'utf8');
    test.notEqual(-1, contents.indexOf('var template1 ='));

    test.done();
  });
})

builder.add(function testFalseShouldDeclareTopLevelNamespaces(test) {
  soyCompiler.setOptions({
    shouldDeclareTopLevelNamespaces: false,
    contextJsPaths: [path.join(__dirname, '/assets/template1_namespace.js')],
    uniqueDir: false
  });
  soyCompiler.compileTemplateFiles([__dirname + '/assets/template1.soy'], function(err) {
    test.ifError(err);

    var soyJsFilePath = path.join('/tmp/soynode', __dirname, 'assets/template1.soy.js');
    var contents = fs.readFileSync(soyJsFilePath, 'utf8');
    test.equal(-1, contents.indexOf('var template1 ='));

    test.done();
  });
})

builder.add(function testWithIjData(test) {
  soyCompiler.setOptions({
    uniqueDir: false
  });
  soyCompiler.compileTemplateFiles([__dirname + '/assets/template1.soy', __dirname + '/assets/template2.soy'], function(err) {
    test.ifError(err);

    var soyJsFilePath = path.join('/tmp/soynode', __dirname, 'assets/template2.soy.js');
    var contents = fs.readFileSync(soyJsFilePath, 'utf8');
    test.notEqual(-1, contents.indexOf('template1.formletter(opt_data, null, opt_ijData)'));

    test.done();
  });
})

builder.add(function testPrecompileTemplatesOneCompiler(test) {
  soyCompiler.setOptions({
    outputDir: tmpDir1,
    uniqueDir: false,
    precompiledDir: tmpDir1
  })

  return Q.nfcall(soyCompiler.compileTemplates.bind(soyCompiler, __dirname + '/assets'))
    .then(function () {
      test.equal(1, spawnOpts.length)
      return Q.nfcall(soyCompiler.compileTemplates.bind(soyCompiler, __dirname + '/assets'))
    })
    .then(function () {
      // Confirm that we re-used the precompiled templates and didn't start a new soy binary.
      test.equal(1, spawnOpts.length)
      assertTemplatesContents(test, null, soyCompiler)
    })
})

builder.add(function testPrecompileTemplatesTwoCompilers(test) {
  soyCompiler.setOptions({
    outputDir: tmpDir1,
    uniqueDir: false
  })

  var soyCompilerB = new soynode.SoyCompiler()
  soyCompilerB.setOptions({
    precompiledDir: tmpDir1
  })

  return Q.nfcall(soyCompiler.compileTemplates.bind(soyCompiler, __dirname + '/assets'))
    .then(function () {
      test.equal(1, spawnOpts.length)
      return Q.nfcall(soyCompilerB.compileTemplates.bind(soyCompilerB, __dirname + '/assets'))
    })
    .then(function () {
      // Confirm that we re-used the precompiled templates and didn't start a new soy binary.
      test.equal(1, spawnOpts.length)
      assertTemplatesContents(test, null, soyCompiler)
      assertTemplatesContents(test, null, soyCompilerB)
    })
})

builder.add(function testPrecompileTemplatesOneCompilerMultipleLanguages(test) {
  soyCompiler.setOptions({
    outputDir: tmpDir1,
    uniqueDir: false,
    precompiledDir: tmpDir1,
    locales: ['pt-BR', 'es'],
    messageFilePathFormat: __dirname + '/assets/translations_{LOCALE}.xlf'
  })

  return Q.nfcall(soyCompiler.compileTemplates.bind(soyCompiler, __dirname + '/assets'))
    .then(function () {
      test.equal(1, spawnOpts.length)
      return Q.nfcall(soyCompiler.compileTemplates.bind(soyCompiler, __dirname + '/assets'))
    })
    .then(function () {
      // Confirm that we re-used the precompiled templates and didn't start a new soy binary.
      test.equal(1, spawnOpts.length)
      assertTemplatesContents(test, 'es')
      assertTemplatesContents(test, 'pt-BR')
    })
})

function assertTemplatesContents(test, locale, opt_soyCompiler) {
  var underTest = opt_soyCompiler || soyCompiler
  var template1 = underTest.render('template1.formletter', { title: 'Mr.', surname: 'Pupius' }, null, locale);
  var template2 = underTest.render('template2.formletter', { title: 'Mr.', surname: 'Santos' }, null, locale);

  test.equal('string', typeof template1)
  test.equal('string', typeof template2)

  switch (locale) {
    case 'pt-BR':
      test.equal(template1, 'Querido Mr. Pupius: Com um nome como Mr. Pupius, você não deveria ter o seu própro tema musical? Nós podemos ajudar!');
      test.equal(template2, 'Querido Mr. Santos: Com um nome como Mr. Santos, você não deveria ter o seu própro tema musical? Nós podemos ajudar!');
      break;
    case 'es':
      test.equal(template1, 'Estimado Mr. Pupius: Con un nombre como Mr. Pupius, ¿no debería tener su propia canción? Nosotros podemos ayudarle!');
      test.equal(template2, 'Estimado Mr. Santos: Con un nombre como Mr. Santos, ¿no debería tener su propia canción? Nosotros podemos ayudarle!');
      break;
    default:
      test.equal(template1, 'Dear Mr. Pupius: With a name like Mr. Pupius, shouldn\'t you have your own theme song? We can help!');
      test.equal(template2, 'Dear Mr. Santos: With a name like Mr. Santos, shouldn\'t you have your own theme song? We can help!');
      break;
  }
}
