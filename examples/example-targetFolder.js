// Copyright (c)2012 The Obvious Corporation

/**
 * @fileoverview Very basic example showing usage of `soynode`.  Try changing message.soy while
 * running this example to see the effects of dynamic recompilation.
 */

var soynode = require('../lib/soynode')

var USER = process.env.USER || 'Stranger'

soynode.setOptions({
    targetDir: './target/'
  , allowDynamicRecompile: true
})

soynode.compileTemplates(__dirname, function (err) {
  if (err) throw err

  console.log(soynode.render('example.message.hello', {
      name: USER
    , date: new Date().toLocaleTimeString()
    , variantToUse: Date.now() % 2 ? 'alpha' : 'beta'
  }))
  process.exit(0);
})

