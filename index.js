const bz2 = require('./lib/bzip2');
const bitIterator = require('./lib/bit_iterator');

class Unbzip2Stream {
    writable;
    readable;

    constructor() {
        let bufferQueue = [];
        let hasBytes = 0;
        let blockSize = 0;
        let broken = false;
        let done = false;
        let bitReader = null;
        let streamCRC = null;

        function decompressBlock(push) {
            if (!blockSize) {
                blockSize = bz2.header(bitReader);
                //console.error("got header of", blockSize);
                streamCRC = 0;
                return true;
            } else {
                const bufsize = 100000 * blockSize;
                const buf = new Int32Array(bufsize);

                const chunk = [];
                const f = function(b) {
                    chunk.push(b);
                };

                streamCRC = bz2.decompress(bitReader, f, buf, bufsize, streamCRC);
                if (streamCRC === null) {
                    // reset for next bzip2 header
                    blockSize = 0;
                    return false;
                } else {
                    //console.error('decompressed', chunk.length,'bytes');
                    push(new Uint8Array(chunk));
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
                        //console.error('write at', outlength.toString(16));
                        outlength += d.length;
                    } else {
                        //console.error('written EOS');
                    }
                });
            } catch(e) {
                //console.error(e);
                controller.error(e);
                broken = true;
                return false;
            }
        }

        function provideData(controller) {
            while (
                !broken &&
                bitReader &&
                (done ?
                    hasBytes > bitReader.bytesRead :
                    hasBytes - bitReader.bytesRead + 1 >= 25000 + 100000 * (blockSize || 4)
                ) &&
                controller.desiredSize > 0
            ) {
                try {
                    //console.error('decompressing with', hasBytes - bitReader.bytesRead + 1, 'bytes in buffer');
                    decompressAndQueue(controller);
                } catch (e) {
                    controller.error(e);
                }
            }
            if (done && !broken && (!bitReader || hasBytes <= bitReader.bytesRead)) {
                if (streamCRC === null) {
                    controller.close();
                } else {
                    controller.error(new Error("input stream ended prematurely"));
                }
            }
        }

        let writableController, readableController;
        let backpressureChangePromiseResolve;

        this.writable = new WritableStream({
            start(controller) {
                writableController = controller;
            },
            async write(data) {
                console.error('received', data.length, 'bytes in', typeof data);
                bufferQueue.push(data);
                hasBytes += data.length;
                if (bitReader === null) {
                    bitReader = bitIterator(function() {
                        return bufferQueue.shift();
                    });
                }
                const backpressureChangePromise = new Promise(resolve => {
                    backpressureChangePromiseResolve = resolve;
                });
                if (readableController.desiredSize > 0) {
                    provideData(readableController);
                }
                if (readableController.desiredSize > 0) {
                    return;
                }
                await backpressureChangePromise;
            },
            close() {
                done = true;
                if (readableController.desiredSize > 0) {
                    provideData(readableController);
                }
            },
            abort(reason) {
                readableController.error(reason);
            }
        });

        this.readable = new ReadableStream({
            start(controller) {
                readableController = controller;
            },
            pull(controller) {
                provideData(controller);
                if (controller.desiredSize > 0 && backpressureChangePromiseResolve) {
                    backpressureChangePromiseResolve();
                }
            },
            cancel(reason) {
                writableController.error(reason);
            }
        });
    }
}

module.exports = Unbzip2Stream;
