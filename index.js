var mapEachResource = require('plumber').mapEachResource;
var Report = require('plumber').Report;
var mercator = require('mercator');
var SourceMap = mercator.SourceMap;

var q = require('q');
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


    return mapEachResource(function(resource, supervisor) {
        // TODO: map extra options (filename, paths, yuicompress, etc)?
        var resourcePath = resource.path();
        var parser = new less.Parser(extend({}, options, {
            filename: resourcePath && resourcePath.absolute()
        }));
        var parse = q.denodeify(parser.parse.bind(parser));
        return parse(resource.data()).then(function(tree) {
            // Tell supervisor about all @imported files
            collectFilenames(tree).forEach(function(dependencyFile) {
                supervisor.dependOn(dependencyFile);
            });

            var sourceMapData;
            var compiledCss = resource.withType('css');
            var cssData = tree.toCSS({
                sourceMap: true,
                sourceMapFilename: compiledCss.sourceMapFilename(),
                // fill sourcesContent
                outputSourceFiles: true,
                writeSourceMap: function writeSourceMap(data) {
                    // this whole pseudo async is somewhat ridiculous
                    sourceMapData = data;
                }
            });

            var data = mercator.stripSourceMappingComment(cssData);
            var sourceMap = SourceMap.fromMapData(sourceMapData);

            // If the source had a sourcemap, rebase the LESS
            // sourcemap based on that original map
            var originalMapData = resource.sourceMap();
            if (originalMapData) {
               sourceMap = originalMapData.apply(sourceMap);
            }

            return compiledCss.withData(data, sourceMap);
        }).catch(function(error) {
            return new Report({
                resource: resource,
                path: resource.path().absolute(),
                type: 'error',
                success: false,
                errors: [{
                    line:    error.line,
                    column:  error.column,
                    message: error.message,
                    context: error.extract.join('\n')
                }]
            });
        });
    });
};
