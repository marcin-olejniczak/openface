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


function getFrame() {
    var msg = {
        'type': 'GET_PREVIEW_FRAME',
        'cameraId': cameraId
    };
    socket.send(JSON.stringify(msg));
    setTimeout(function() {requestAnimFrame(getFrame)}, 250);
}

function createSocket(address, name) {
    socket = new WebSocket(address);
    socketName = name;
    socket.binaryType = "arraybuffer";
    socket.onopen = function() {
        $("#serverStatus").html("Connected to " + name);

        socket.send(JSON.stringify({'type': 'NULL'}));
    }
    socket.onmessage = function(e) {
        console.log(e);
        j = JSON.parse(e.data)
        if (j.type == "PREVIEW_FRAME") {
            $("#detectedFaces").html(
                "<img src='" + j['previewFrame'] + "' class='col-lg-12'></img>"
            )

            names = j['names'];
            peopleList = $('#peopleList');
            peopleList.html("");
            $.each(names, function(key, value){
                peopleList.append($('<li>', {text: value}));
            });

        } else if (j.type == "NONE_CAMERA") {

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

function setCameraId() {
    if($("#setCameraIdTxt").val()) {
    cameraId = $("#setCameraIdTxt").val();
        getFrame()
    }
}

var cameraId, currencyList;
var socket, socketName;

$(document).ready(function() {
    $("#setCameraIdBtn").click(setCameraId);
    $("#setCameraIdTxt").pressEnter(setCameraId);

    createSocket("ws:" + window.location.hostname + ":9000", "Local");
});