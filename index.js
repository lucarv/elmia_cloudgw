/*jshint globalstrict: true*/
'use strict';

require('dotenv').load();
const devArray = require('./config/cs.json');
const poleNumber = process.argv[3];
//const poleNumber = '06';

const fs = require('fs');
const request = require('request');
const Protocol = require('azure-iot-device-mqtt').Mqtt;
const devClient = require('azure-iot-device').Client;
const Message = require('azure-iot-device').Message;
const hubClient = require('azure-iothub').Client;
const ftpClient = require('ftp');

const ftpRoot = process.env.FTP_ROOT + poleNumber;
const device = devArray[parseInt(poleNumber) - 1];
const cs = device.cs;
const tenant = device.tenant;
const did = device.did;

const connectionString = process.env.HUBCS;
const url = process.env.FACE_API_URL;
const apikey = process.env.FACE_API_KEY;

const header = {
    'Content-Type': 'application/octet-stream',
    'Ocp-Apim-Subscription-Key': apikey
};

const params = {
    "returnFaceId": "true",
    "returnFaceLandmarks": "false",
    "returnFaceAttributes": "age,gender,smile"
};

var files = [],
    fetch = [],
    listing = false,
    processing = '',
    faceCounter = 0,
    noFaceCounter = 0;

console.log('v0516.001');
console.log('###-------------------------------------------------------------------------------#');
console.log('### TENANT: ' + tenant);
console.log('###-------------------------------------------------------------------------------#');

function printResultFor(op) {
    return function printResult(err, res) {
        if (err) console.log('# ' + op + ' error: ' + err.toString());
        if (res) console.log('# ' + op + ' status: ' + res.constructor.name);
    };
}

const devConnCallback = (err) => {
    if (err) {
        console.error('# Could not connect POLE: ' + err.message);
    } else {
        console.log('# POLE connected to IOT HUB');
    }
};

const servConnCallback = (err) => {
    if (err) {
        console.error('# Could not connect RELAYER: ' + err.message);
    } else {
        console.log('# RELAYER connected to IOT HUB');
    }
};

const skipImage = (image) => {
    var index = fetch.indexOf(image);

    if (index > -1) {
        fetch.splice(index, 1);
        console.log('# spliced IMAGE -> ' + image);
    }
    c.delete(image, function (err) {
        if (err) console.log('# ERROR deleting from FTP server -> ' + err);
        else console.log('# DEBUG: ' + image + ' deleted due to bad file');
    });

    listing = false;
    processing = '';
};

var c = new ftpClient();
var d = devClient.fromConnectionString(cs, Protocol);
var s = hubClient.fromConnectionString(connectionString);

d.open(devConnCallback);
s.open(servConnCallback);

c.on('ready', function () {
    console.log('# POLE connected to FTP SERVER');
    c.cwd(ftpRoot, function (err) {
        if (err) console.log('# ERROR: no such directory');
        else
            c.list(function (err, list) {
                if (err) console.log('# ERROR getting file list -> ' + err);

            });
    });
    var looper = setInterval(scanFolder, process.env.SCAN_INTERVAL);
    var counterLoop = setInterval(counterLog, 300000);

});

c.connect({
    "host": process.env.FTP_HOST,
    "user": process.env.FTP_USER,
    "password": process.env.FTP_PWD
});

const counterLog = () => {
    console.log('###----------------------------------------------------------------------------------#');
    console.log('# ' + new Date());
    console.log('# STATS: ' + faceCounter + ' faces detected');
    console.log('# STATS: ' + noFaceCounter + ' images without faces');
};

const scanFolder = () => {
    if (listing == false) {
        console.log('### idle, get next image ...');
        c.list(function (err, list) {
            //process.stdout.write('.');
            if (err)('# ERROR getting images list from FTP server -> ' + err);
            else {
                console.log('# STATS: ' + list.length + ' images in server');
                if (list == undefined)
                    console.log('# ERROR getting images list from FTP server');
                else {
                    if (list.length > 0) {
                        let filename = list[0].name;
                        if (filename.indexOf('jpg') === -1)
                            c.delete(filename, function (err) {
                                if (err) console.log('# ERROR deleting from FTP server -> ' + err);
                                else console.log('# DEBUG: ' + filename + ' deleted due to bad file');
                            });
                        else {
                            console.log('### next is ...' + filename)

                            if (filename != processing) {
                                processing = filename;
                                listing = true;
                                fetchImage(filename);
                            } else console.log('# DEBUG: ' + filename + ' still being processed');
                        }
                    }
                    else 
                        console.log('### no image in ftp server...');
                }
            }
        });
    }
};

const fetchImage = (filename) => {
    //console.log('# DEBUG: ' + filename + ' processing started');
    var image = filename;
    c.get(image, function (err, stream) {
        if (err) {
            console.log('# ERROR getting IMAGE ' + filename + ' -> ' + err);
            /*
                        listing = false;

            var index = fetch.indexOf(image);
            if (index > -1) {
                fetch.splice(index, 1);
                console.log('# spliced IMAGE -> ' + image);
            }
            c.delete(filename, function (err) {
                if (err) console.log('# ERROR deleting from FTP server -> ' + err);
                else console.log('# DEBUG: ' + filename + ' deleted due to bad file');
            });
            */
           skipImage(image);
        } else if (stream != undefined) {
            let bufs = [];
            stream.on('data', function (data) {
                bufs.push(data);
            });
            stream.on('end', function () {
                let buf = Buffer.concat(bufs);
                if (buf.length == 0) {
                    console.log('# ERROR image file is zero bytes');
                    listing = false;
                } else {
                    analyseFace(image, buf);
                }
            });
            var index = fetch.indexOf(image);
            if (index > -1) {
                fetch.splice(index, 1);
            }

        } else {
            console.log('# ERROR empty image - not streamable');
            skipImage(image);
        }
    });
};

const analyseFace = (filename, byteStream) => {

    const options = {
        url: url,
        qs: params,
        body: byteStream,
        method: 'POST',
        headers: header
    };

    request(options, function (err, res, body) {
        listing = false;

        if (err) {
            console.log('# ERROR from Cognitive API -> ' + err);
        } else {
            let result = JSON.parse(body);
            if (result.error) console.log('# ERROR from Cognitive API -> ' + result.error.code);
            else {
                c.delete(filename, function (err) {
                    if (err)
                        console.log('# ERROR deleting image -> ' + err);
                    else
                        console.log('# DEBUG: ' + filename + ' deleted');
                });

                if (result.length == 0) {
                    console.log('### no faces in image: ' + filename);
                    noFaceCounter++;
                } else {
                    faceCounter += result.length;
                    for (let idx = 0; idx < result.length; idx++) {
                        let payload = {
                            "faceId": result[idx].faceId,
                            "faceAttributes": result[idx].faceAttributes
                        };
                        let hubJson = {
                            "age": payload.faceAttributes.age.toFixed(),
                            "smile": payload.faceAttributes.smile === 1 ? true : false,
                            "gender": payload.faceAttributes.gender
                        };
                        // send cognitive info as telemetry
                        console.log('#------------------------------------------------------------------------------------#');
                        console.log('# ' + filename + ' analysis: ' + JSON.stringify(hubJson));
                        var d2cMessage = new Message(JSON.stringify(hubJson));
                        d.sendEvent(d2cMessage, printResultFor('sendD2C'));

                        // send cognitive info back to device
                        let plcJson = {
                            "sAge": payload.faceAttributes.age.toFixed(),
                            "sHappy": payload.faceAttributes.smile.toString(),
                            "sGender": payload.faceAttributes.gender
                        };
                        var c2dMessage = new Message(JSON.stringify(plcJson));
                        c2dMessage.ack = 'full';
                        c2dMessage.messageId = "filename";
                        console.log('# DEBUG: Relaying message ' + c2dMessage.getData() + ' to ' + tenant);
                        s.send(did, c2dMessage, printResultFor('sendC2D'));

                        fs.writeFile(filename, byteStream, "binary", function (err) {
                            if (err) console.log('# ERROR storing image: ' + err);
                            else uploadToBlob(filename);
                        });


                    }
                }
            }
        }
    });
};

const uploadToBlob = (filename) => {
    console.log('# UPLOADING successful image: ' + filename + ' to BLOB STORAGE');

    fs.stat(filename, function (err, stats) {
        const rr = fs.createReadStream(filename);

        d.uploadToBlob(filename, rr, stats.size, function (err) {
            if (err) {
                console.error('# ERROR uploading file: ' + err.toString());
            } else {
                console.log('# DEBUG: ' + filename + ' uploaded');
                fs.unlink(filename, function (err) {
                    if (err) console.log('# ERROR deleting file from local store: ' + err.toString());
                    else console.log('# DEBUG: ' + filename + '  removed from local storage');
                });
            }
        });
    });

};