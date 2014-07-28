'use strict';

var soynode = require('../lib/soynode.js');

module.exports = {
  testCompileTemplates: function(test) {
    soynode.compileTemplates(__dirname + '/assets', function(err) {
      test.ifError(err);
      test.doesNotThrow(assertTemplatesContents.bind(null, test));
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
  }
};

function assertTemplatesContents(test) {
  var template1 = soynode.render('template1.formletter', { title: 'Mr.', surname: 'Pupius' });
  var template2 = soynode.render('template2.formletter', { title: 'Mr.', surname: 'Santos' });
  test.equal(template1, 'Dear Mr. Pupius: With a name like Mr. Pupius, shouldn\'t you have your own theme song? We can help!');
  test.equal(template2, 'Dear Mr. Santos: With a name like Mr. Santos, shouldn\'t you have your own theme song? We can help!');
}