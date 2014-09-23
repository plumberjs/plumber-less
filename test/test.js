var chai = require('chai');
chai.should();

var sinon = require("sinon");
var sinonChai = require("sinon-chai");
chai.use(sinonChai);

var SourceMapConsumer = require('source-map').SourceMapConsumer;
var fs = require('fs');


var runOperation = require('plumber-util-test').runOperation;
var completeWithResources = require('plumber-util-test').completeWithResources;
var runAndCompleteWith = require('plumber-util-test').runAndCompleteWith;

var Resource = require('plumber').Resource;
var Report = require('plumber').Report;
// var Supervisor = require('plumber/lib/util/supervisor');
var SourceMap = require('mercator').SourceMap;

var less = require('..');

function createResource(params) {
    return new Resource(params);
}

function resourcesError() {
  chai.assert(false, "error in resources observable");
}


describe('less', function(){
    // var supervisor;

    // beforeEach(function() {
    //     supervisor = new Supervisor();
    //     supervisor.dependOn = sinon.spy();
    // });


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
            transformedResources = runOperation(less(), [
                createResource({path: 'test/fixtures/main.less', type: 'less', data: mainData})
            ]).resources;
        });

        it('should return a single resource with a CSS filename', function(done){
            completeWithResources(transformedResources, function(resources) {
                resources.length.should.equal(1);
                resources[0].filename().should.equal('main.css');
            }, resourcesError, done);
        });

        it('should return a resource with CSS data', function(done){
            var outputMain = fs.readFileSync('test/fixtures/output-main.css').toString();
            completeWithResources(transformedResources, function(resources) {
                resources[0].data().should.equal(outputMain);
            }, resourcesError, done);
        });

        it('should return a resource with a source map with correct properties', function(done){
            completeWithResources(transformedResources, function(resources) {
                var sourceMap = resources[0].sourceMap();
                sourceMap.file.should.equal('main.css');
                sourceMap.sources.should.deep.equal([
                    'test/fixtures/other.less',
                    'test/fixtures/sub/helper.less',
                    'test/fixtures/plain.css',
                    'test/fixtures/main.less'
                ]);
                sourceMap.sourcesContent.should.deep.equal([
                    "@w: 10px;\n\n.other {\n    float: left;\n\n    .nested {\n        padding: @w;\n    }\n}",
                    ".child {\n    .parent & {\n        font-size: 10px;\n    }\n}\n",
                    ".plain {\n    color: red;\n}\n",
                    "@import \"other\";\n@import \"sub/helper\";\n@import (less) \"plain.css\";\n\nbody {\n    margin: 0;\n}"
                ]);
            }, resourcesError, done);
        });

        it('should return a resource with a source map with correct mappings', function(done){
            completeWithResources(transformedResources, function(resources) {
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
            }, resourcesError, done);
        });

        // FIXME: restore Supervisor
        it.skip('should register all the imported files into the supervisor', function(done){
            completeWithResources(transformedResources, function() {
                supervisor.dependOn.should.have.callCount(3);
                supervisor.dependOn.should.have.been.calledWith('test/fixtures/other.less');
                supervisor.dependOn.should.have.been.calledWith('test/fixtures/sub/helper.less');
                supervisor.dependOn.should.have.been.calledWith('test/fixtures/plain.css');
            }, resourcesError, done);
        });
    });

    describe('when passed a LESS file with a source map', function() {
        var transformedResources;
        var mainData = fs.readFileSync('test/fixtures/concatenated.less').toString();
        var mainMapData = SourceMap.fromMapData(fs.readFileSync('test/fixtures/concatenated.less.map').toString());

        beforeEach(function() {
            transformedResources = runOperation(less(), [
                createResource({path: 'test/fixtures/concatenated.less', type: 'less',
                                data: mainData, sourceMap: mainMapData})
            ]).resources;
        });

        it('should return a resource with a source map with correct properties from the input source map', function(done){
            completeWithResources(transformedResources, function(resources) {
                var sourceMap = resources[0].sourceMap();

                sourceMap.file.should.equal('concatenated.css');
                sourceMap.sources.should.deep.equal(mainMapData.sources);
                sourceMap.sourcesContent.should.deep.equal(mainMapData.sourcesContent);
            }, resourcesError, done);
        });

        it('should remap mappings based on the input source map', function(done) {
            completeWithResources(transformedResources, function(resources) {
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
                    source: '1.less',
                    line: 1,
                    column: 0,
                    name: null
                });
                map.originalPositionFor({line: 2, column: 2}).should.deep.equal({
                    source: '1.less',
                    line: 3,
                    column: 0, // not really tracked, it seems
                    name: null
                });
                map.originalPositionFor({line: 4, column: 0}).should.deep.equal({
                    source: '2.less',
                    line: 1,
                    column: 0,
                    name: null
                });
                map.originalPositionFor({line: 5, column: 2}).should.deep.equal({
                    source: '2.less',
                    line: 3,
                    column: 0,
                    name: null
                });
            }, resourcesError, done);
        });

        // FIXME: restore Supervisor?
        it.skip('should register no path in the supervisor', function(done){
            completeWithResources(transformedResources, function() {
                supervisor.dependOn.should.not.have.been.called;
            }, resourcesError, done);
        });

    });


    describe('when passed a resource with invalid LESS syntax', function() {

        it('should return an error report if missing closing bracket', function(done){
            var missingClosingBracket = createResource({
                path: 'test/fixtures/concatenated.less',
                type: 'less',
                data: '.foo {'
            });

            runAndCompleteWith(less(), [missingClosingBracket], function(reports) {
                reports.length.should.equal(1);
                reports[0].should.be.instanceof(Report);
                reports[0].writtenResource.should.equal(missingClosingBracket);
                reports[0].type.should.equal('error');
                reports[0].success.should.equal(false);
                reports[0].errors[0].line.should.equal(1);
                reports[0].errors[0].column.should.equal(5);
                reports[0].errors[0].message.should.equal('[Parse] missing closing `}`');
                reports[0].errors[0].context.should.equal('.foo {');
            }, resourcesError, done);
        });


        it('should return an error report if using undeclared var', function(done){
            var missingClosingBracket = createResource({
                path: 'test/fixtures/concatenated.less',
                type: 'less',
                data: '.foo {\n  border: @missing;\n}'
            });

            runAndCompleteWith(less(), [missingClosingBracket], function(reports) {
                reports.length.should.equal(1);
                reports[0].should.be.instanceof(Report);
                reports[0].writtenResource.should.equal(missingClosingBracket);
                reports[0].type.should.equal('error');
                reports[0].success.should.equal(false);
                reports[0].errors[0].line.should.equal(2);
                reports[0].errors[0].column.should.equal(10);
                reports[0].errors[0].message.should.equal('[Name] variable @missing is undefined');
                reports[0].errors[0].context.should.equal('  border: @missing;');
            }, resourcesError, done);
        });
    });
});
