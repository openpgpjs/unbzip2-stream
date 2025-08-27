[![npm version](https://badge.fury.io/js/@openpgp%2Funbzip2-stream.svg)](https://badge.fury.io/js/@openpgp%2Funbzip2-stream)

unbzip2-stream
===
streaming bzip2 decompressor in pure JS for Node and browsers.

In both environments, the library uses `TransformStream`s and `Uint8Array`s.

Usage
---

### Node
``` js
const Unbzip2Stream = require('unbzip2-stream');
const fs = require('fs');

// decompress test.bz2 and output the result
fs.createReadStream('./test.bz2')
    .pipe(stream.Duplex.fromWeb(new Unbzip2Stream()))
    .pipe(process.stdout);
```

### Web
``` js
import Unbzip2Stream from 'unbzip2-stream';

// decompress test.bz2 and output the result
const response = await fetch('./test.bz2');
const decompressedStream = response.data.pipeThrough(new Unbzip2Stream());
for await(const chunk of decompressedStream) {
    console.log(chunk);
}
```

Also see [test/browser/download.js](https://github.com/openpgpjs/unbzip2-stream/blob/master/test/browser/download.js) for a complete example of decompressing a file while downloading.

Tests
---
To run tests in Node:

    npm run test

To run tests in PhantomJS

    npm run browser-test

Additional Tests
----------------
There are two more tests that specifically test decompression of a very large file. Because I don't want to include large binary files in this repository, the files are created by running an npm script.

    npm run prepare-long-test

You can now

    npm run long-test

And to run a test in chrome that downloads and decompresses a large binary file

    npm run download-test

Open the browser's console to see the output.

