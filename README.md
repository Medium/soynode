soynode
=======

Utility for working with [Closure Templates](https://developers.google.com/closure/templates/),
aka Soy, from within a node.js application.  Supports dynamic recompilation and loading for fast
iteration during development.

Installing
----------

Either:

1. Fork, clone or download the source from GitHub, or
2. Install via NPM using `npm install soynode`


Usage
-----

See `examples/example.js`.

`soynode.get(templatename)` - Returns a JS function corresponding to the template name.

`soynode.render(templatename, data)` - Returns a string that results from executing a template.

`soynode.setOptions(opts)` - Change the options, see section below.

`soynode.compileTemplates(dir, callback)` - Compiles and loads all `.soy` files in the directory.

`soynode.loadCompiledTemplates(dir, callback)` - Loads already compiled templates.

`soynode.loadCompiledTemplateFiles(files, callback)` - Loads already compiled templates.

Where "template name" is referred to, it means the namespace + template name as defined in the Soy
file, and the full JS name that the Soy Compiler generates, for example `project.section.screen`.
See the [Hello World JS](https://developers.google.com/closure/templates/docs/helloworld_js) doc on
the Closure site for more background.

Options
-------

Options can be set via `soynode.setOptions(options)`, the keys can contain the following:

- `tmpDir` {string} Path to a directory where temporary files will be written during compilation.
  [Default: /tmp/soynode]
- `allowDynamicRecompile` {boolean} Whether to watch for changes to the templates. [Default: false]
- `eraseTemporaryFiles` {boolean} Whether to erase temporary files after a compilation.
[Default: false]

**NOTE: Options should be set before templates are loaded or compiled.**

Caveats
-------

The present implementation loads the compiled templates in the global scope.  So while it is
recommended that you access templates via `soynode.get(project.section.content)` you could reference
the symbol `project.section.content()` directly.  This does mean there is a chance that template
namespaces will collide with other variables.

I would have preferred to execute the templates using `vm.runInContext()` however the additional
overhead meant runtime was several orders of magnitude slower than direct function calls.

In the future it would be nice to sandbox the template functions, so you should not rely on the
presence of the templates as global symbols.

Contributing
------------

Questions, comments, bug reports, and pull requests are all welcome. Submit them at
[the project on GitHub](https://github.com/Obvious/soynode/).

Bug reports that include steps-to-reproduce (including code) are the best. Even better, make them in
the form of pull requests.

Author
------

[Dan Pupius](https://github.com/dpup)
([personal website](http://pupius.co.uk/about/)), supported by
[The Obvious Corporation](http://obvious.com/).

License
-------

Copyright 2012 [The Obvious Corporation](http://obvious.com/).

Licensed under the Apache License, Version 2.0.
See the top-level file `LICENSE.txt` and
(http://www.apache.org/licenses/LICENSE-2.0).
