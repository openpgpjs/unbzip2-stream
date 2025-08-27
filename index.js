var bz2 = require('./lib/bzip2');
var bitIterator = require('./lib/bit_iterator');

module.exports = unbzip2Stream;

function unbzip2Stream() {
    var bufferQueue = [];
    var hasBytes = 0;
    var blockSize = 0;
    var broken = false;
    var done = false;
    var bitReader = null;
    var streamCRC = null;

    function decompressBlock(push){
        if(!blockSize){
            blockSize = bz2.header(bitReader);
            //console.error("got header of", blockSize);
            streamCRC = 0;
            return true;
        }else{
            var bufsize = 100000 * blockSize;
            var buf = new Int32Array(bufsize);
            
            var chunk = [];
            var f = function(b) {
                chunk.push(b);
            };

            streamCRC = bz2.decompress(bitReader, f, buf, bufsize, streamCRC);
            if (streamCRC === null) {
                // reset for next bzip2 header
                blockSize = 0;
                return false;
            }else{
                //console.error('decompressed', chunk.length,'bytes');
                push(new Uint8Array(chunk));
                return true;
            }
        }
    }

    var outlength = 0;
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
        if (done && !broken && hasBytes <= bitReader.bytesRead) {
            if (streamCRC === null) {
                controller.close();
            } else {
                controller.error(new Error("input stream ended prematurely"));
            }
        }
    }

    let writableController, readableController;
    let backpressureChangePromiseResolve;
    const writable = new WritableStream({
        start(controller) {
            writableController = controller;
        },
        async write(data) {
            //console.error('received', data.length, 'bytes in', typeof data);
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
            provideData(readableController);
            if (readableController.desiredSize > 0) {
                return;
            }
            await backpressureChangePromise;
        },
        close() {
            done = true;
            provideData(readableController);
        },
        abort(reason) {
            readableController.error(reason);
        }
    });
    const readable = new ReadableStream({
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

    return { writable, readable };
}

