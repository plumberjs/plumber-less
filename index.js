var operation = require('plumber').operation;
var Report = require('plumber').Report;
var Rx = require('plumber').Rx;
var mercator = require('mercator');
var SourceMap = mercator.SourceMap;

var less = require('less');
var extend = require('extend');
var flatten = require('flatten');


// Recursively extract "importedFilename" properties
function collectFilenames(node) {
    // TODO: exclude root node, we only want the dependencies
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


// Returns an Observable of events for the gazed patterns
var Gaze = require('gaze').Gaze;
function gazeObservable(patterns) {
    return Rx.Observable.defer(function() {
        console.log("gaze")
        var gazer = new Gaze(patterns);
        return Rx.Observable.fromEvent(gazer, 'all');
    })
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

    function parseLess(resource) {
        var resourcePath = resource.path();
        var parser = new less.Parser(extend({}, options, {
            filename: resourcePath && resourcePath.absolute()
        }));

        var parse = Rx.Node.fromNodeCallback(parser.parse.bind(parser));
        return parse(resource.data()).map(function(tree) {
            return {
                resource: resource,
                tree: tree
            };
        })
        // return tree: parse(resource.data())
    }

    function compileLess(obj) {
        // FIXME: need resource
        var resource = obj.resource
        var compiledCss = resource.withType('css');
        return toCSS(obj.tree, compiledCss.sourceMapFilename())
            .map(function(out) {
                var data = mercator.stripSourceMappingComment(out.data);
                var sourceMap = SourceMap.fromMapData(out.sourceMapData);

                // If the source had a sourcemap, rebase the LESS
                // sourcemap based on that original map
                var originalMapData = resource.sourceMap();
                if (originalMapData) {
                    sourceMap = originalMapData.apply(sourceMap);
                }

                return compiledCss.withData(data, sourceMap);
            });
    }

    function extractDependencies(tree) {
        var dependenciesPaths = collectFilenames(tree)
        return dependenciesPaths
    }

    return function lessOperation(executions) {
        var currentExecution = executions.take(1);
        var nextExecutions   = executions.skip(1);

        var currentTree = currentExecution.map(function(resources) {
            return resources.flatMap(parseLess); // trees
        });

        var currentOut = currentTree.map(function(objs) {
            return objs.flatMap(compileLess); // cssResources
        });

        var currentDeps = currentTree.flatMap(function(objs) {
            console.log("== extract deps ")
            // TODO: dedupe
            var deps = objs.
                    map(function(obj){ return obj.tree; }).
                    map(extractDependencies).
                    toArray().
                    map(flatten)
            return deps
        });


        // TODO: disconnect gaze
        var changes = currentDeps.flatMap(gazeObservable).flatMap(function() {
            console.log(">> change, mapped to executions")
            return executions
            // })
        }).share()

        // var next = Rx.Observable.amb(nextExecutions, changes)
        var next = Rx.Observable.amb(nextExecutions, changes)

        var currentOut2 = currentOut.map(function(objs) {
            console.log("OUT", objs)
            return objs.map(function(x) {
                console.log("INNER", x)
                return x;
            }).catch(function(error) {
                console.log("ERR", error)
                var errorReport = new Report({
                    // resource: resource,
                    type: 'error', // FIXME: ?
                    success: false,
                    errors: [{
                        line:    error.line,
                        column:  error.column,
                        message: '[' + error.type + '] ' + error.message,
                        context: error.extract[1] // FIXME: ?
                    }]
                });
process.exit(0)
                return Rx.Observable.return(errorReport);
            }).do(console.log.bind(console))

            return objs.catch(function(error) {
                // Catch and map LESS error
                var errorReport = new Report({
                    // resource: resource,
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
        })

        // FIXME: why recursing if only taking 1?
        // https://github.com/Reactive-Extensions/RxJS/issues/236
        console.log("[[ RET ]]")
        return currentOut2.concat(Rx.Observable.defer(function() {
            console.log("[[ RECURSE ]]")
            return lessOperation(next)
        }));

    }











    return operation(function(resources) {
        return resources.flatMap(function runLess(resource) {
            // TODO: map extra options (filename, paths, etc)?
            var resourcePath = resource.path();
            var compiledCss = resource.withType('css');
            var parser = new less.Parser(extend({}, options, {
                filename: resourcePath && resourcePath.absolute()
            }));

            var parse = Rx.Node.fromNodeCallback(parser.parse.bind(parser));
            return parse(resource.data()).flatMap(function(tree) {
                var dependenciesPaths = collectFilenames(tree)
                console.log(dependenciesPaths)
                return toCSS(tree, compiledCss.sourceMapFilename())
                    .map(function(out) {
                        var data = mercator.stripSourceMappingComment(out.data);
                        var sourceMap = SourceMap.fromMapData(out.sourceMapData);

                        // If the source had a sourcemap, rebase the LESS
                        // sourcemap based on that original map
                        var originalMapData = resource.sourceMap();
                        if (originalMapData) {
                            sourceMap = originalMapData.apply(sourceMap);
                        }

                        return compiledCss.withData(data, sourceMap);
                    }).concat(Rx.Observable.defer(function() {
                        // TODO: watch
                        var changes = gazeObservable(dependenciesPaths);
                        var gazedDependencies = changes.flatMap(function() { return runLess(resource) });
                        console.log("watch")
                        return gazedDependencies;
                    }));
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


