plumber-less [![Build Status](https://travis-ci.org/plumberjs/plumber-less.png?branch=master)](https://travis-ci.org/plumberjs/plumber-less)
============

[LESS](http://lesscss.org/) compilation operation for [Plumber](https://github.com/plumberjs/plumber) pipelines.

## Example

    var less = require('plumber-less');

    module.exports = function(pipelines) {

        pipelines['css'] = [
            glob('main.less'),
            less(),
            // ... more pipeline operations
        ];

        pipelines['icons'] = [
            glob('icons.less'),
            less({rootPath: '../..'}),
            // ... more pipeline operations
        ];

    };


## API

### `less(lessOptions)`

Compile each input LESS resource to a single CSS resource.

Optionally, options can be passed to the LESS compiler via the `lessOptions` parameter.

Note that you may **not** specify minimisation configuration options, such as `compress` or `cleancss`; this should be done using the [plumber-mincss](https://github.com/plumberjs/plumber-mincss) operation instead, to ensure atomicity of operations.
