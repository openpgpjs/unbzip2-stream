const unbzip2Stream = require('../../');
const test = require('tape');

test('http stream piped into unbzip2-stream results in original file content', async function(t) {
    t.plan(1);

    const response = await fetch('/test/fixtures/text.bz2');
    const responseStream = response.body;
    const decompressedStream = responseStream
        .pipeThrough(unbzip2Stream())
        .pipeThrough(new TextDecoderStream());
    const chunks = [];
    for await (const chunk of decompressedStream) {
        chunks.push(chunk);
    }
    const data = chunks.join('');

    const expected = 'Hello World!\nHow little you are. now.\n\n';
    t.equal(data, expected);
});
