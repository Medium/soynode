'use strict';

var child_process = require('child_process')
var fs = require('fs');
var path = require('path');
var soynode = require('../lib/soynode.js');

var watchFile = fs.watchFile
var now = Date.now
var spawn = child_process.spawn

module.exports = {
  tearDown: function (done) {
    Date.now = now;
    fs.watchFile = watchFile;
    child_process.spawn = spawn;
    soynode.setOptions(soynode.getDefaultOptions());
    done();
  },

  testCompileTemplates: function(test) {
    soynode.compileTemplates(__dirname + '/assets', function(err) {
      test.ifError(err);
      test.doesNotThrow(assertTemplatesContents.bind(null, test));
      test.done();
    });
  },

  testCompileTemplatesWatch: function(test) {
    var time = 1;
    Date.now = function () { return time; };

    var files = [];
    var callbacks = [];
    fs.watchFile = function (f, opts, callback) {
      files.push(f);
      callbacks.push(callback);
    };

    var spawnOpts = []
    child_process.spawn = function (prog, args, opts) {
      spawnOpts.push(opts)
      return spawn.apply(child_process, arguments)
    }

    soynode.setOptions({allowDynamicRecompile: true})
    soynode.compileTemplates(__dirname + '/assets', function(err) {
      test.ifError(err);

      test.deepEqual(['template1.soy', 'template2.soy'], files.map(function (f) {
        return path.basename(f);
      }))
      test.deepEqual([{cwd: __dirname + '/assets'}], spawnOpts)

      time += 1000
      callbacks[1]()

      test.deepEqual(['template1.soy', 'template2.soy'], files.map(function (f) {
        return path.basename(f);
      }))
      test.deepEqual([{cwd: __dirname + '/assets'}, {cwd: __dirname + '/assets'}], spawnOpts)

      test.done();
    });
  },

  testCompileTemplateFiles: function(test) {
    soynode.compileTemplateFiles([__dirname + '/assets/template1.soy', __dirname + '/assets/template2.soy'], function(err) {
      test.ifError(err);
      test.doesNotThrow(assertTemplatesContents.bind(null, test));
      test.done();
    });
  },

  testCompileTemplateFilesRelativePath: function(test) {
    soynode.setOptions({ inputDir: __dirname });
    soynode.compileTemplateFiles(['./assets/template1.soy', './assets/template2.soy'], function(err) {
      test.ifError(err);
      test.doesNotThrow(assertTemplatesContents.bind(null, test));
      test.done();
    });
  },

  testCompileAndTranslateTemplates: function(test) {
    soynode.setOptions({
      locales: ['pt-BR'],
      messageFilePathFormat: __dirname + '/assets/translations_pt-BR.xlf'
    });
    soynode.compileTemplates(__dirname + '/assets', function(err) {
      test.ifError(err);
      test.doesNotThrow(assertTemplatesContents.bind(null, test, 'pt-BR'));
      test.done();
    });
  },

  testCompileAndTranslateMultipleLanguagesTemplates: function(test) {
    soynode.setOptions({
      locales: ['pt-BR', 'es'],
      messageFilePathFormat: __dirname + '/assets/translations_{LOCALE}.xlf'
    });
    soynode.compileTemplates(__dirname + '/assets', function(err) {
      test.ifError(err);
      test.doesNotThrow(assertTemplatesContents.bind(null, test, 'pt-BR'));
      test.doesNotThrow(assertTemplatesContents.bind(null, test, 'es'));
      test.done();
    });
  }
};

function assertTemplatesContents(test, locale) {
  var template1 = soynode.render('template1.formletter', { title: 'Mr.', surname: 'Pupius' }, null, locale);
  var template2 = soynode.render('template2.formletter', { title: 'Mr.', surname: 'Santos' }, null, locale);

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
