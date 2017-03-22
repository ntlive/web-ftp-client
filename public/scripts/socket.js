"use strict";

/**
 * socket stuff
 */
var socket = {};

/** @type {WebSocket} */
socket.con = null;

/** @type {function[]} */
socket.callbacks = [];

/** @type {object} */
socket.queue = [];

/** @type {{}} */
socket.onMessageEvents = {};

/** @type {number|null} */
socket.port = null;

/**
 * The user data from the logged in user
 * @type {null|object}
 */
socket.userData = null;

/**
 * Bind a callback to be triggered everytime a message is received
 * @param {string} id The handler id
 * @param {function} callback
 */
socket.onMessage = function (id, callback) {
    socket.onMessageEvents[id] = callback;
};

/**
 * Unbind a callback
 * @param {string} id
 */
socket.offMessage = function (id) {
    delete socket.onMessageEvents[id];
};

/**
 * Send the queue
 */
socket.sendQueue = function () {
    // send all messages in the queue
    for (var i = 0; i < socket.queue.length; i++) {
        var q = socket.queue[i];
        socket.send(q.action, q.message, q.callback);
    }
    socket.queue = [];
};

/**
 * Connect to WebSocket
 * @param {function=} callback If connection is established
 */
socket.connect = function (callback) {
    var cb = function () {
        var con = new WebSocket('ws://' + window.location.hostname + ':' + socket.port);
        /**
         * On open connection
         */
        con.onopen = function () {
            socket.con = con;
            // send init ping to backend
            socket.send("init", null, function (message) {
                if (message.userData) {
                    socket.userData = message.userData;
                }
                var b = $("body");
                if (socket.userData) {
                    b.addClass("is-logged-in");
                    if (socket.userData.admin) {
                        b.addClass("is-admin");
                    } else {
                        b.addClass("is-not-admin");
                    }
                } else {
                    b.addClass("is-not-logged-in is-not-admin");
                }
                if (message.package.version) {
                    $(".app-version").text(message.package.version);
                    if (message.latestVersion && message.package.version && message.latestVersion != message.package.version) {
                        $(".top-logo .update").removeClass("hidden");
                    }
                }
                if (callback) callback(message);
                socket.sendQueue();
            });
        };

        /**
         * On WebSocket error
         * @param error
         */
        con.onerror = function (error) {
            console.error('WebSocket Error ' + error);
        };

        /**
         * On message received from backend
         */
        con.onmessage = function (e) {
            if (e.data) {
                var data = JSON.parse(e.data);
                if (data.action) {
                    if (typeof data.callbackId != "undefined") {
                        var callbackId = data.callbackId;
                        if (socket.callbacks[callbackId] === null) {
                            console.error("No socket callback for id " + callbackId + ", maybe dupe callback in backend?");
                        } else {
                            socket.callbacks[callbackId](data.message);
                            socket.callbacks[callbackId] = null;
                        }
                    }
                    for (var i in socket.onMessageEvents) {
                        if (socket.onMessageEvents.hasOwnProperty(i)) {
                            var cb = socket.onMessageEvents[i];
                            if (cb) cb(data.action, data.message);
                        }
                    }
                    // show server disconnect message
                    if (data.action == "serverDisconnect") {
                        note(t("server.disconnect") + ": " + data.message.servername, "danger");
                    }
                }
            }
        };

        /**
         * On connection close
         */
        con.onclose = function () {
            socket.con = null;
            // reload page after 5 seconds
            note("socket.disconnect", "danger");
            setTimeout(function () {
                window.location.reload();
            }, 5000);
        };
    };
    if (socket.port) {
        cb();
    } else {
        // load the required port number
        $.get("wsport", function (port) {
            socket.port = parseInt(port);
            cb();
        });
    }
};

/**
 * Connect to socket and load view for current url hash
 */
socket.connectAndLoadView = function () {
    socket.connect(function () {

    });
};

/**
 * Send a command to the backend
 * @param {string} action
 * @param {object=} message
 * @param {function=} callback
 */
socket.send = function (action, message, callback) {
    var receiveCallback = function (receivedMessage) {
        if (receivedMessage && receivedMessage.error) {
            var message = "Server Error: " + receivedMessage.error.message;
            if (receivedMessage.error.stack) {
                message = "<strong>Server Error</strong>\n" + receivedMessage.error.stack;
            }
            $("#content").html($('<div class="alert alert-danger" style="white-space: pre-wrap"></div>').html(message));
            socket.callbacks = [];
            return;
        }
        if (callback) callback(receivedMessage);
    };
    if (typeof message == "undefined") {
        message = null;
    }
    // if connection not yet established add to queue
    if (socket.con === null) {
        socket.queue.push({
            "action": action,
            "message": message,
            "callback": callback
        });
        return;
    }
    var data = {
        "action": action,
        "callbackId": socket.callbacks.length,
        "message": message,
        "loginName": storage.get("loginName"),
        "loginHash": storage.get("loginHash")
    };
    socket.callbacks.push(receiveCallback);
    socket.con.send(JSON.stringify(data));
};