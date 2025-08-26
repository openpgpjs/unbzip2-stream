var unbzip2Stream = require('../');
var stream = require('stream');
var concat = require('concat-stream');
var test = require('tape');
var fs = require('fs');

test('accepts data as a web transform stream', async function(t) {
    t.plan(1);
    const fileStream = stream.Readable.toWeb(fs.createReadStream('test/fixtures/text.bz2'));
    const decompressedStream = fileStream.pipeThrough(unbzip2Stream()).pipeThrough(new TextDecoderStream());
    const chunks = [];
    for await (const chunk of decompressedStream) {
        chunks.push(chunk);
    }
    const expected = "Hello World!\nHow little you are. now.\n\n";
    t.equal(chunks.join(''), expected);
});

test('accepts data in both write and end', function(t) {
    t.plan(1);
    var compressed = fs.readFileSync('test/fixtures/text.bz2');
    var unbz2 = stream.Duplex.fromWeb(unbzip2Stream());
    unbz2.on('error', function(err) { t.fail(err.message); });
    unbz2.pipe( concat(function(data) {
        var expected = "Hello World!\nHow little you are. now.\n\n";
        t.equal(data.toString('utf-8'), expected);
    }));
    unbz2.write(compressed.subarray(0, 4));
    unbz2.end(compressed.subarray(4));
});

test('accepts concatenated bz2 streams', function(t) {
    t.plan(1);
    var compressed = fs.readFileSync('test/fixtures/concatenated.bz2');
    var unbz2 = stream.Duplex.fromWeb(unbzip2Stream());
    unbz2.on('error', function(err) { t.fail(err.message); });
    unbz2.pipe( concat(function(data) {
        var expected = "ab\n";
        t.equal(data.toString('utf-8'), expected);
    }));
    unbz2.end(compressed);
});

test('should emit error when stream is broken', function(t) {
    t.plan(1);
    var compressed = fs.readFileSync('test/fixtures/broken');
    var unbz2 = stream.Duplex.fromWeb(unbzip2Stream());
    unbz2.on('error', function(err) {
        t.ok(true, err.message);
    });
    unbz2.pipe( concat(function(data) {
        var expected = "Hello World!\nHow little you are. now.\n\n";
        t.ok(false, 'we should not get here');
    }));
    unbz2.end(compressed);
});

test('should emit error when crc is broken', function(t) {
    t.plan(1);
    var compressed = fs.readFileSync('test/fixtures/brokencrc.bz2');
    var unbz2 = stream.Duplex.fromWeb(unbzip2Stream());
    unbz2.on('error', function(err) {
        t.ok(true, err.message);
    });
    unbz2.pipe( concat(function(data) {
        var expected = "Hello World!\nHow little you are. now.\n\n";
        t.ok(false, 'we should not get here');
    }));
    unbz2.end(compressed);
});

test('decompresses empty stream', function(t) {
    t.plan(1);
    var compressed = fs.readFileSync('test/fixtures/empty.bz2');
    var unbz2 = stream.Duplex.fromWeb(unbzip2Stream());
    unbz2.on('error', function(err) { t.fail(err.message); });
    unbz2.pipe( concat(function(data) {
        var expected = "";
        t.equal(data.toString('utf-8'), expected);
    }));
    unbz2.end(compressed);
});

test('decompresses empty input', function(t) {
    t.plan(1);
    var unbz2 = stream.Duplex.fromWeb(unbzip2Stream());
    unbz2.on('error', function(err) { t.fail(err.message); });
    unbz2.pipe( concat(function(data) {
        var expected = "";
        t.equal(data.toString('utf-8'), expected);
    }));
    unbz2.end();
});

test('should emit error when block crc is wrong', function(t) {
    t.plan(1);
    var compressed = fs.readFileSync('test/fixtures/brokenblockcrc.bz2');
    var unbz2 = stream.Duplex.fromWeb(unbzip2Stream());
    unbz2.on('error', function(err) { t.pass(err.message); });
    unbz2.pipe(concat());
    unbz2.end(compressed);
});

test('should emit error when stream is broken in a different way?', async function(t) {
    t.plan(1);
    // this is the smallest truncated file I found that reproduced the bug, but
    // longer files will also work.
    const fileStream = stream.Readable.toWeb(fs.createReadStream('test/fixtures/truncated.bz2'));
    const decompressedStream = fileStream.pipeThrough(unbzip2Stream());
    try {
        for await (const chunk of decompressedStream) {}
        t.ok(false, "Should not reach end of stream without failing.");
    } catch (err) {
        t.ok(true, err);
    }
});

test('detects incomplete streams', async function(t) {
    t.plan(1);
    const fileStream = stream.Readable.toWeb(fs.createReadStream('test/fixtures/nostreamcrc.bz2'));
    const decompressedStream = fileStream.pipeThrough(unbzip2Stream());
    try {
        for await (const chunk of decompressedStream) {}
        t.ok(false, "Should not reach end of stream without failing.");
    } catch (err) {
        t.ok(true, err);
    }
});