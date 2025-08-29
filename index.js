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
                return false;
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
                return true;
            }
        }

        let writableController, readableController;
        let dataAvailablePromiseResolve, backpressureChangePromiseResolve;

        this.writable = new WritableStream({
            start(controller) {
                writableController = controller;
            },
            async write(data) {
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
                if (dataAvailablePromiseResolve) {
                    dataAvailablePromiseResolve();
                }
                await backpressureChangePromise;
            },
            close() {
                done = true;
                if (dataAvailablePromiseResolve) {
                    dataAvailablePromiseResolve();
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
            async pull(controller) {
                while (true) {
                    const hasSufficientData =
                        done ||
                        (
                            bitReader &&
                            hasBytes - bitReader.bytesRead + 1 >= 25000 + 100000 * (blockSize || 4)
                        );
                    if (!hasSufficientData) {
                        let dataAvailablePromise = new Promise(resolve => {
                            dataAvailablePromiseResolve = resolve;
                        });
                        if (backpressureChangePromiseResolve) {
                            backpressureChangePromiseResolve();
                        }
                        await dataAvailablePromise;
                    }
                    if (bitReader && hasBytes > bitReader.bytesRead) {
                        try {
                            //console.error('decompressing with', hasBytes - bitReader.bytesRead + 1, 'bytes in buffer');
                            if (decompressAndQueue(controller)) {
                                return; // `pull` will get called again
                            }
                        } catch (e) {
                            controller.error(e);
                            return;
                        }
                    }
                    if (done && !broken && (!bitReader || hasBytes <= bitReader.bytesRead)) {
                        if (streamCRC === null) {
                            controller.close();
                        } else {
                            controller.error(new Error("input stream ended prematurely"));
                        }
                        return;
                    }
                }
            },
            cancel(reason) {
                writableController.error(reason);
            }
        });
    }
}

module.exports = Unbzip2Stream;
