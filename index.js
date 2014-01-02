var mapEachResource = require('plumber').mapEachResource;

var q = require('q');
var less = require('less');
var extend = require('extend');

var render = q.denodeify(less.render);


module.exports = function(options) {
    return mapEachResource(function(resource) {
        // TODO: map extra options (filename, paths, yuicompress, etc)?
        var parser = new less.Parser(extend({}, options, {
            filename: resource.filename()
        }));
        var parse = q.denodeify(parser.parse.bind(parser));
        return parse(resource.data()).then(function(tree) {
            var sourceMapData;
            var cssData = tree.toCSS({
                sourceMap: true,
                writeSourceMap: function writeSourceMap(data) {
                    // this whole pseudo async is somewhat ridiculous
                    sourceMapData = data;
                }
            });

            var compiledCss = resource.replaceExtension('css').withData(cssData);
            return [
                compiledCss,
                compiledCss.withExtension('map').withData(sourceMapData)
            ];
        });
    });
};
