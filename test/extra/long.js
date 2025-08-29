const unbzip2Stream = require('../..');
const stream = require('stream');
const test = require('tape');
const fs = require('fs');
const streamEqual = require('stream-equal');

test('a very large binary file piped into unbzip2-stream results in original file content', function(t) {
    t.plan(1);
    const source = fs.createReadStream('test/fixtures/vmlinux.bin.bz2');
    const expected = fs.createReadStream('test/fixtures/vmlinux.bin');
    const { writable, readable } = new TransformStream();
    const unbz2 = stream.Duplex.fromWeb({
        readable: unbzip2Stream(readable),
        writable
    });
    source.pipe(unbz2);
    streamEqual(expected, unbz2, function(err, equal) {
        if (err)
            t.ok(false, err);
        t.ok(equal, "same file contents");
    });
});
