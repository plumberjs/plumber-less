var operation = require('plumber').operation;
var Report = require('plumber').Report;
var Rx = require('plumber').Rx;
var mercator = require('mercator');
var SourceMap = mercator.SourceMap;

var less = require('less');
var extend = require('extend');


// Recursively extract "importedFilename" properties
function collectFilenames(node) {
    // FIXME: flaky way of doing this
    var files = (node.rules || []).reduce(function(files, rule) {
        if (rule.importedFilename) {
            files = files.concat(rule.importedFilename);
        }
        return files.concat(collectFilenames(rule));
    }, []);

    return files;
}

// Wrap `toCSS' to return the value as an Observable
function toCSS(tree, sourceMapFilename) {
    return Rx.Observable.defer(function(push, next) {
        try {
            var sourceMapData;
            var cssData = tree.toCSS({
                sourceMap: true,
                sourceMapFilename: sourceMapFilename,
                // fill sourcesContent
                outputSourceFiles: true,
                writeSourceMap: function writeSourceMap(data) {
                    // this whole pseudo async is somewhat ridiculous
                    sourceMapData = data;
                }
            });
            return Rx.Observable.return({data: cssData, sourceMapData: sourceMapData});
        } catch(e) {
            return Rx.Observable.throw(e);
        }
    });
}


// Unwanted minimisation options
var minimisationOptions = ['compress', 'cleancss'];

module.exports = function(options) {
    options = options || {};

    // Abort if any illegal option provided
    minimisationOptions.forEach(function(key) {
        if (key in options) {
            throw new Error("The plumber-less operation should not be used to minimise, please use plumber-mincss instead");
        }
    });


    // FIXME: restore supervisor?
    // FIXME: using operation.parallelFlatMap causes tests and examples to fail?
    return operation(function(resources) {
        return resources.flatMap(function(resource) {
            // TODO: map extra options (filename, paths, etc)?
            var resourcePath = resource.path();
            var compiledCss = resource.withType('css');
            var parser = new less.Parser(extend({}, options, {
                filename: resourcePath && resourcePath.absolute()
            }));

            var parse = Rx.Node.fromNodeCallback(parser.parse.bind(parser));
            return parse(resource.data()).flatMap(function(tree) {
                return toCSS(tree, compiledCss.sourceMapFilename());
            }).map(function(out) {
                var data = mercator.stripSourceMappingComment(out.data);
                var sourceMap = SourceMap.fromMapData(out.sourceMapData);

                // If the source had a sourcemap, rebase the LESS
                // sourcemap based on that original map
                var originalMapData = resource.sourceMap();
                if (originalMapData) {
                    sourceMap = originalMapData.apply(sourceMap);
                }

                return compiledCss.withData(data, sourceMap);
            }).catch(function(error) {
                // Catch and map LESS error
                var errorReport = new Report({
                    resource: resource,
                    type: 'error', // FIXME: ?
                    success: false,
                    errors: [{
                        line:    error.line,
                        column:  error.column,
                        message: '[' + error.type + '] ' + error.message,
                        context: error.extract[1] // FIXME: ?
                    }]
                });
                return Rx.Observable.return(errorReport);
            });
        });
    });
};
