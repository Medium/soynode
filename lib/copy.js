'use strict'

/**
 * A hacky copy method until
 * https://github.com/jprichardson/node-fs-extra/issues/326
 * is fixed.
 */

var fs = require('fs')

function copy(source, target, callback) {
  var readStream = fs.createReadStream(source)
  var writeStream = fs.createWriteStream(target)
  var isDone = false

  function onError(err) {
    if (isDone) return
    isDone = true
    callback(err)
  }
  readStream.on('error', onError)
  writeStream.on('error', onError)

  writeStream.on('open', function () {
    readStream.pipe(writeStream)
  })

  writeStream.once('close', function () {
    if (isDone) return
    isDone = true
    callback(null)
  })
}

module.exports = copy
