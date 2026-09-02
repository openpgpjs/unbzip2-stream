const bz2 = require('./lib/bzip2');
const bitIterator = require('./lib/bit_iterator');

module.exports = unbzip2Stream;

function unbzip2Stream(input) {
    const bufferQueue = [];
    let hasBytes = 0;
    let blockSize = 0;
    let broken = false;
    let hasAllData = false;
    let bitReader = null;
    let streamCRC = null;

    function decompressBlock(push){
        if(!blockSize) {
            blockSize = bz2.header(bitReader);
            streamCRC = 0;
            return false;
        } else {
            const bufsize = 100000 * blockSize;
            const buf = new Int32Array(bufsize);

            // Growable output buffer
            let chunk = new Uint8Array(32768);
            let chunkLen = 0;
            const f = function(b) {
                if (chunkLen === chunk.length) {
                    // Grow the chunk buffer
                    const newLen = Math.min(chunk.length * 2, chunkLen + (maxDecompressedBytes - totalOut) + 1);
                    const bigger = new Uint8Array(newLen);
                    bigger.set(chunk);
                    chunk = bigger;
                }
                chunk[chunkLen++] = b;
            };

            streamCRC = bz2.decompress(bitReader, f, buf, bufsize, streamCRC);
            if (streamCRC === null) {
                // reset for next bzip2 header
                blockSize = 0;
                return false;
            } else {
                push(chunk.subarray(0, chunkLen));
                return true;
            }
        }
    }

    let outlength = 0;
    function decompressAndQueue(controller) {
        if (broken) return;
        try {
            return decompressBlock(function(d) {
                controller.enqueue(d);
                if (d !== null) {
                    outlength += d.length;
                }
            });
        } catch(e) {
            controller.error(e);
            broken = true;
            return true;
        }
    }

    let inputReader;
    return new ReadableStream({
        start() {
            inputReader = input.getReader();
        },
        async pull(controller) {
            try {
                while (true) {
                    while (!(
                        hasAllData ||
                            (
                                bitReader &&
                                hasBytes - bitReader.bytesRead + 1 >= 25000 + 100000 * (blockSize || 4)
                            )
                    )) {
                        const { value, done } = await inputReader.read();
                        if (!done) {
                            bufferQueue.push(value);
                            hasBytes += value.length;
                            if (bitReader === null) {
                                bitReader = bitIterator(function() {
                                    return bufferQueue.shift();
                                });
                            }
                        } else {
                            hasAllData = true;
                        }
                    }
                    while (
                        hasAllData ?
                            (bitReader && hasBytes > bitReader.bytesRead) :
                            (
                                bitReader &&
                                hasBytes - bitReader.bytesRead + 1 >= 25000 + 100000 * (blockSize || 4)
                            )
                    ) {
                        //console.error('decompressing with', hasBytes - bitReader.bytesRead + 1, 'bytes in buffer');
                        if (decompressAndQueue(controller)) {
                            return; // `pull` will get called again
                        }
                    }
                    if (hasAllData && !broken && (!bitReader || hasBytes <= bitReader.bytesRead)) {
                        if (streamCRC === null) {
                            controller.close();
                        } else {
                            controller.error(new Error("input stream ended prematurely"));
                        }
                        return;
                    }
                }
            } catch (e) {
                controller.error(e);
            }
        },
        async cancel(reason) {
            await inputReader.abort(reason);
        }
    }, { highWaterMark: 0 });
}
