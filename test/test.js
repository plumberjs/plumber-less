var chai = require('chai');
chai.should();
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);

var sinon = require("sinon");
var sinonChai = require("sinon-chai");
chai.use(sinonChai);

require('mocha-as-promised')();

var SourceMapConsumer = require('source-map').SourceMapConsumer;
var fs = require('fs');


var Resource = require('plumber').Resource;
var Supervisor = require('plumber/lib/util/supervisor');
var SourceMap = require('mercator').SourceMap;

var less = require('..');

function createResource(params) {
    return new Resource(params);
}


describe('less', function(){
    var supervisor;

    beforeEach(function() {
        supervisor = new Supervisor();
        supervisor.dependOn = sinon.spy();
    });


    it('should be a function', function(){
        less.should.be.a('function');
    });

    it('should return a function', function(){
        less().should.be.a('function');
    });

    it('should throw an error if passed a minimisation option', function(){
        (function() {
            less({compress: true});
        }).should.throw("The plumber-less operation should not be used to minimise, please use plumber-mincss instead");

        (function() {
            less({cleancss: true});
        }).should.throw("The plumber-less operation should not be used to minimise, please use plumber-mincss instead");
    });

    // TODO: test options

    describe('when passed a LESS file', function() {
        var transformedResources;
        var mainData = fs.readFileSync('test/fixtures/main.less').toString();

        beforeEach(function() {
            transformedResources = less()([
                createResource({path: 'test/fixtures/main.less', type: 'less', data: mainData})
            ], supervisor);
        });

        it('should return a single resource with a CSS filename', function(){
            return transformedResources.then(function(resources) {
                resources.length.should.equal(1);
                resources[0].filename().should.equal('main.css');
            });
        });

        it('should return a resource with CSS data', function(){
            var outputMain = fs.readFileSync('test/fixtures/output-main.css').toString();
            return transformedResources.then(function(resources) {
                resources[0].data().should.equal(outputMain);
            });
        });

        it('should return a resource with a source map with correct properties', function(){
            return transformedResources.then(function(resources) {
                var sourceMap = resources[0].sourceMap();
                sourceMap.file.should.equal('main.css');
                sourceMap.sources.should.deep.equal([
                    'test/fixtures/other.less',
                    'test/fixtures/sub/helper.less',
                    'test/fixtures/plain.css',
                    'test/fixtures/main.less'
                ]);
            });
        });

        it('should return a resource with a source map with correct mappings', function(){
            return transformedResources.then(function(resources) {
                var map = new SourceMapConsumer(resources[0].sourceMap());

                /*
              1  .other {
              2    float: left;
              3  }
              4  .other .nested {
              5    padding: 10px;
              6  }
              7  .parent .child {
              8    font-size: 10px;
              9  }
             10  .plain {
             11    color: red;
             12  }
             13  body {
             14    margin: 0;
             15  }
                 */
                map.originalPositionFor({line: 1, column: 0}).should.deep.equal({
                    source: 'test/fixtures/other.less',
                    line: 3,
                    column: 0,
                    name: null
                });
                map.originalPositionFor({line: 2, column: 2}).should.deep.equal({
                    source: 'test/fixtures/other.less',
                    line: 4,
                    column: 4,
                    name: null
                });
                map.originalPositionFor({line: 5, column: 2}).should.deep.equal({
                    source: 'test/fixtures/other.less',
                    line: 7,
                    column: 8,
                    name: null
                });
                map.originalPositionFor({line: 8, column: 2}).should.deep.equal({
                    source: 'test/fixtures/sub/helper.less',
                    line: 3,
                    column: 8,
                    name: null
                });
                map.originalPositionFor({line: 10, column: 0}).should.deep.equal({
                    source: 'test/fixtures/plain.css',
                    line: 1,
                    column: 0,
                    name: null
                });
                map.originalPositionFor({line: 11, column: 2}).should.deep.equal({
                    source: 'test/fixtures/plain.css',
                    line: 2,
                    column: 4,
                    name: null
                });
                map.originalPositionFor({line: 13, column: 0}).should.deep.equal({
                    source: 'test/fixtures/main.less',
                    line: 5,
                    column: 0,
                    name: null
                });
                map.originalPositionFor({line: 14, column: 2}).should.deep.equal({
                    source: 'test/fixtures/main.less',
                    line: 6,
                    column: 4,
                    name: null
                });
            });
        });

        it('should register all the imported files into the supervisor', function(){
            return transformedResources.then(function() {
                supervisor.dependOn.should.have.callCount(3);
                supervisor.dependOn.should.have.been.calledWith('test/fixtures/other.less');
                supervisor.dependOn.should.have.been.calledWith('test/fixtures/sub/helper.less');
                supervisor.dependOn.should.have.been.calledWith('test/fixtures/plain.css');
            });
        });
    });

    describe('when passed a LESS file with a source map', function() {
        var transformedResources;
        var mainData = fs.readFileSync('test/fixtures/concatenated.less').toString();
        var mainMapData = SourceMap.fromMapData(fs.readFileSync('test/fixtures/concatenated.less.map').toString());

        beforeEach(function() {
            transformedResources = less()([
                createResource({path: 'test/fixtures/concatenated.less', type: 'less',
                                data: mainData, sourceMap: mainMapData})
            ], supervisor);
        });

        it('should return a resource with a source map with correct properties from the input source map', function(){
            return transformedResources.then(function(resources) {
                var sourceMap = resources[0].sourceMap();

                sourceMap.file.should.equal('concatenated.css');
                sourceMap.sources.should.deep.equal(mainMapData.sources);
                sourceMap.sourcesContent.should.deep.equal(mainMapData.sourcesContent);
            });
        });

        it('should remap mappings based on the input source map', function() {
            return transformedResources.then(function(resources) {
                var map = new SourceMapConsumer(resources[0].sourceMap());

                /*
               1 .one p {
               2   border: 1;
               3 }
               4 .two ul {
               5   margin: 2px;
               6 }
                 */
                map.originalPositionFor({line: 1, column: 0}).should.deep.equal({
                    source: 'test/fixtures/1.less',
                    line: 1,
                    column: 0,
                    name: null
                });
                map.originalPositionFor({line: 2, column: 0}).should.deep.equal({
                    source: 'test/fixtures/1.less',
                    line: 2,
                    column: 0, // not really tracked, it seems
                    name: null
                });
                map.originalPositionFor({line: 4, column: 0}).should.deep.equal({
                    source: 'test/fixtures/2.less',
                    line: 1,
                    column: 0,
                    name: null
                });
                map.originalPositionFor({line: 5, column: 0}).should.deep.equal({
                    source: 'test/fixtures/2.less',
                    line: 2,
                    column: 0,
                    name: null
                });
            });
        });

        it('should register no path in the supervisor', function(){
            return transformedResources.then(function() {
                supervisor.dependOn.should.not.have.been.called;
            });
        });

    });
});
