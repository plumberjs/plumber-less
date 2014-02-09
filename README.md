plumber-less [![Build Status](https://travis-ci.org/plumberjs/plumber-less.png?branch=master)](https://travis-ci.org/plumberjs/plumber-less)
============

LESS compilation operation for [Plumber](https://github.com/plumberjs/plumber) pipelines.

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
