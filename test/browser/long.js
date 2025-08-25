var unbzip2Stream = require('../../');
var test = require('tape');

test('http stream piped into unbzip2-stream results in original file content', async function(t) {
    t.plan(1);

    const response = await fetch('/test/fixtures/vmlinux.bin.bz2');
    const responseStream = response.body;
    const decompressedStream = responseStream.pipeThrough(unbzip2Stream());
    const chunks = [];
    for await (const chunk of decompressedStream) {
        chunks.push(chunk);
    }
    const data = await new Blob(chunks).arrayBuffer();

    const expectedResponse = await fetch('/test/fixtures/vmlinux.bin');
    const expected = await expectedResponse.arrayBuffer();
    t.equal(data.length, expected.length);
});
