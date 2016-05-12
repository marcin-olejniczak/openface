/*
Copyright 2015-2016 Carnegie Mellon University

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

window.URL = window.URL ||
    window.webkitURL ||
    window.msURL ||
    window.mozURL;

// http://stackoverflow.com/questions/6524288
$.fn.pressEnter = function(fn) {

    return this.each(function() {
        $(this).bind('enterPress', fn);
        $(this).keyup(function(e){
            if(e.keyCode == 13)
            {
              $(this).trigger("enterPress");
            }
        })
    });
 };

function registerHbarsHelpers() {
    // http://stackoverflow.com/questions/8853396
    Handlebars.registerHelper('ifEq', function(v1, v2, options) {
        if(v1 == v2) {
            return options.fn(this);
        }
        return options.inverse(this);
    });
}

function sendFrameLoop() {
    if (socket == null || socket.readyState != socket.OPEN ||
        !vidReady || numNulls != defaultNumNulls) {
        return;
    }

    if (tok > 0) {
        var canvas = document.createElement('canvas');
        canvas.width = vid.width;
        canvas.height = vid.height;
        var cc = canvas.getContext('2d');
        cc.drawImage(vid, 0, 0, vid.width, vid.height);
        var apx = cc.getImageData(0, 0, vid.width, vid.height);

        var dataURL = canvas.toDataURL('image/jpeg', 0.6)

        var msg = {
            'type': 'FRAME',
            'dataURL': dataURL,
            'identity': defaultPerson
        };
        socket.send(JSON.stringify(msg));
        tok--;
    }
    if (site != 'person') {
        setTimeout(function() {requestAnimFrame(sendFrameLoop)}, 250);
    } else {
        if ($("#trainingChk").prop('checked') ){
            setTimeout(function() {requestAnimFrame(sendFrameLoop)}, 250);
        }
    }
}


function getPeopleInfoHtml() {
    var info = {'-1': 0};
    for (var key in people) {
        info[key] = 0;
    }

    var len = images.length;
    for (var i = 0; i < len; i++) {
        id = images[i].identity;
        info[id] += 1;
    }
    if (site == 'person') {
        var valueMax = $('#progress_bar div').attr('aria-valuemax')
        $('#progress_bar div').width((info[defaultPerson]/valueMax*100)+'%');
        $('#progress_bar span').text(info[defaultPerson]+'/'+valueMax);
        if (info[defaultPerson] >= valueMax) {
            $("#trainingChk").bootstrapToggle('off');
            $("#addPersonTxt").parent().show();
        }
        var h = "";
    } else {
        var h = "<li><b>Unknown:</b> "+info['-1']+"</li>";
    }
    for (var key in people) {
        h += "<li><b>"+people[key]+":</b> "+info[key]+"</li>";
    }

    $("#peopleInfo").html(h);
}

function redrawPeople() {
    if (site != 'person') {
        var context = {people: people, images: images};
        $("#peopleTable").html(peopleTableTmpl(context));

        var context = {people: people};
        $("#defaultPersonDropdown").html(defaultPersonTmpl(context));
    }

    getPeopleInfoHtml();
}

function getDataURLFromRGB(rgb) {
    var rgbLen = rgb.length;

    var canvas = $('<canvas/>').width(96).height(96)[0];
    var ctx = canvas.getContext("2d");
    var imageData = ctx.createImageData(96, 96);
    var data = imageData.data;
    var dLen = data.length;
    var i = 0, t = 0;

    for (; i < dLen; i +=4) {
        data[i] = rgb[t+2];
        data[i+1] = rgb[t+1];
        data[i+2] = rgb[t];
        data[i+3] = 255;
        t += 3;
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL("image/png");
}

function updateRTT() {
    var diffs = [];
    for (var i = 5; i < defaultNumNulls; i++) {
        diffs.push(receivedTimes[i] - sentTimes[i]);
    }
    $("#rtt-"+socketName).html(
        jStat.mean(diffs).toFixed(2) + " ms (σ = " +
            jStat.stdev(diffs).toFixed(2) + ")"
    );
}

function sendState() {
    var msg = {
        'type': 'ALL_STATE',
        'images': images,
        'people': people,
        'training': training
    };
    socket.send(JSON.stringify(msg));
}

function createSocket(address, name) {
    socket = new WebSocket(address);
    socketName = name;
    socket.binaryType = "arraybuffer";
    socket.onopen = function() {
        $("#serverStatus").html("Connected to " + name);
        sentTimes = [];
        receivedTimes = [];
        tok = defaultTok;
        numNulls = 0

        socket.send(JSON.stringify({'type': 'NULL'}));
        sentTimes.push(new Date());
    }
    socket.onmessage = function(e) {
        console.log(e);
        j = JSON.parse(e.data)
        if (j.type == "NULL") {
            receivedTimes.push(new Date());
            numNulls++;
            if (numNulls == defaultNumNulls) {
                updateRTT();
                sendState();
                sendFrameLoop();
            } else {
                socket.send(JSON.stringify({'type': 'NULL'}));
                sentTimes.push(new Date());
            }
        } else if (j.type == "PROCESSED") {
            tok++;
        } else if (j.type == "NEW_ID") {
            defaultPerson = j.count;
            addPersonCallback();
        } else if (j.type == "NEW_IMAGE") {
            images.push({
                hash: j.hash,
                identity: j.identity,
                image: getDataURLFromRGB(j.content),
                representation: j.representation
            });
            redrawPeople();
        } else if (j.type == "IDENTITIES") {
            var h = "Last updated: " + (new Date()).toTimeString();
            h += "<ul>";
            var len = j.identities.length
            if (len > 0) {
                for (var i = 0; i < len; i++) {
                    var identity = "Unknown";
                    var idIdx = j.identities[i];
                    if (idIdx != -1) {
                        identity = people[idIdx];
                    }
                    h += "<li>" + identity + "</li>";
                }
            } else {
                h += "<li>Nobody detected.</li>";
            }
            h += "</ul>"
            $("#peopleInVideo").html(h);
        } else if (j.type == "ANNOTATED") {
            $("#detectedFaces").html(
                "<img src='" + j['content'] + "' width='430px'></img>"
            )
        } else if (j.type == "TSNE_DATA") {
            BootstrapDialog.show({
                message: "<img src='" + j['content'] + "' width='100%'></img>"
            });
        } else {
            console.log("Unrecognized message type: " + j.type);
        }
    }
    socket.onerror = function(e) {
        console.log("Error creating WebSocket connection to " + address);
        console.log(e);
    }
    socket.onclose = function(e) {
        if (e.target == socket) {
            $("#serverStatus").html("Disconnected.");
        }
    }
}

function umSuccess(stream) {
    if (vid.mozCaptureStream) {
        vid.mozSrcObject = stream;
    } else {
        vid.src = (window.URL && window.URL.createObjectURL(stream)) ||
            stream;
    }
    vid.play();
    vidReady = true;
    sendFrameLoop();
}

function getNewId(){
    var newPerson = $("#addPersonTxt").val();
    if (newPerson == "") return;
    if (socket != null) {
        var msg = {
            'type': 'GET_NEW_ID'
        };
        socket.send(JSON.stringify(msg));
    }
}

function addPersonCallback(el) {
    var newPerson = $("#addPersonTxt").val();
    if (newPerson == "") return;
    people[defaultPerson] = newPerson;
    $("#addPersonTxt").val("");

    if (socket != null) {
        var msg = {
            'type': 'ADD_PERSON',
            'val': newPerson
        };
        socket.send(JSON.stringify(msg));
    }
    if (site == 'person') {
        $("#trainingChk").bootstrapToggle('on');
        $("#addPersonTxt").parent().hide();
    }
    redrawPeople();
}

function trainingChkCallback() {
    training = $("#trainingChk").prop('checked');
    if (socket != null) {
        var msg = {
            'type': 'TRAINING',
            'val': training
        };
        socket.send(JSON.stringify(msg));
    }
    if (site == 'person') {
        sendFrameLoop();
    } else {
        if (training) {
            makeTabActive("tab-preview");
        } else {
            makeTabActive("tab-annotated");
        }
    }
}

function viewTSNECallback(el) {
    if (socket != null) {
        var msg = {
            'type': 'REQ_TSNE',
            'people': people
        };
        socket.send(JSON.stringify(msg));
    }
}

function findImageByHash(hash) {
    var imgIdx = 0;
    var len = images.length;
    for (imgIdx = 0; imgIdx < len; imgIdx++) {
        if (images[imgIdx].hash == hash) {
            console.log("  + Image found.");
            return imgIdx;
        }
    }
    return -1;
}

function updateIdentity(hash, idx) {
    var imgIdx = findImageByHash(hash);
    if (imgIdx >= 0) {
        images[imgIdx].identity = idx;
        var msg = {
            'type': 'UPDATE_IDENTITY',
            'hash': hash,
            'idx': idx
        };
        socket.send(JSON.stringify(msg));
    }
}

function removeImage(hash) {
    console.log("Removing " + hash);
    var imgIdx = findImageByHash(hash);
    if (imgIdx >= 0) {
        images.splice(imgIdx, 1);
        redrawPeople();
        var msg = {
            'type': 'REMOVE_IMAGE',
            'hash': hash
        };
        socket.send(JSON.stringify(msg));
    }
}

function changeServerCallback() {
    $(this).addClass("active").siblings().removeClass("active");
    switch ($(this).html()) {
    case "Local":
        socket.close();
        redrawPeople();
        createSocket("ws:" + window.location.hostname + ":9000", "Local");
        break;
    case "CMU":
        socket.close();
        redrawPeople();
        createSocket("ws://facerec.cmusatyalab.org:9000", "CMU");
        break;
    case "AWS East":
        socket.close();
        redrawPeople();
        createSocket("ws://54.159.128.49:9000", "AWS-East");
        break;
    case "AWS West":
        socket.close();
        redrawPeople();
        createSocket("ws://54.188.234.61:9000", "AWS-West");
        break;
    default:
        alert("Unrecognized server: " + $(this.html()));
    }
}

var vid = document.getElementById('videoel'),
    vidReady = false;
var defaultTok = 1, defaultNumNulls = 20;
var tok = defaultTok,
    people = {}, defaultPerson = -1,
    images = [],
    training = false;
var numNulls, sentTimes, receivedTimes;
var socket, socketName;

$(document).ready(function() {

    $("#trainingChk").bootstrapToggle('off');
    if (navigator.getUserMedia) {
        var videoSelector = {video: true};
        navigator.getUserMedia(videoSelector, umSuccess, function () {
            alert("Error fetching video from webcam");
        });
    } else {
        alert("No webcam detected.");
    }
    $("#addPersonBtn").click(getNewId);
    $("#addPersonTxt").pressEnter(getNewId);

    $("#trainingChk").change(trainingChkCallback);

    redrawPeople();
    createSocket("ws:" + window.location.hostname + ":9000", "Local");
});