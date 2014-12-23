// Copyright (c)2012 The Obvious Corporation

/**
 * @fileoverview Public interface exposed to users of `soynode`.
 */

var SoyCompiler = require('./SoyCompiler')

// Public API.  See function declarations for JSDoc.
module.exports = new SoyCompiler()
module.exports.SoyCompiler = SoyCompiler
