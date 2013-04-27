// Copyright (c)2012 The Obvious Corporation

/**
 * @fileoverview Very basic example showing usage of `soynode`.  Try changing message.soy while
 * running this example to see the effects of dynamic recompilation.
 */

var soynode = require('../lib/soynode')

var USER = process.env.USER || 'Stranger'

soynode.setOptions({
    outputDir: '/tmp/soynode-example'
  , uniqueDir: true
  , allowDynamicRecompile: true
  , eraseTemporaryFiles: true
})

soynode.compileTemplates(__dirname, function (err) {
  if (err) throw err

  console.log('Templates are ready, Ctrl-C to exit')

  setInterval(function () {
    console.log(soynode.render('example.message.hello', {
        name: USER
      , date: new Date().toLocaleTimeString()
      , variantToUse: Date.now() % 2 ? 'alpha' : 'beta'
    }))
  }, 1000)

  process.on('SIGINT', function () {
    console.log(soynode.render('example.message.bye', {
        name: USER
    }))
    process.exit(0)
  })

})

