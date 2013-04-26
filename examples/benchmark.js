// Copyright (c)2012 The Obvious Corporation

/**
 * @fileoverview Basic benchmark for hello world template that calls one nested template.
 */

var soynode = require('../lib/soynode')

var USER = process.env.USER || 'Stranger'

soynode.setOptions({
    outputDir: '/tmp/soynode-example'
  , uniqueDir: true
  , eraseTemporaryFiles: true
})

var iterations = 5000

soynode.compileTemplates(__dirname, function (err) {
  if (err) throw err
  var d = Date.now()
  var results = []
  for (var i = 0; i < iterations; i++) {
    results.push(soynode.render('example.message.hello', {
        name: USER
      , date: new Date().toLocaleTimeString()
    }))
  }
  var diff = Date.now() - d

  console.log('Total time spent:', diff, 'ms')
  console.log('Number of iterations:', iterations)
  console.log('Ops per sec:', Math.round((1000 / diff) * iterations))
})
