// hide non active element on load
document.getElementById('joinedHeader').style.display = 'none';
document.getElementById('leaveNetwork').style.display = 'none';
document.getElementById('members').style.display = 'none';
document.getElementById('gobetween').style.display = 'none';

//// constants

// from broker message headers
var IN_JOINED = 'in network with id';
var IN_MEMBER_LIST = 'members of network';
var IN_WEBRTC_ANSWER = 'answer from';
var IN_WEBRTC_OFFER = 'offer from';
var IN_REQUEST_TIMEOUT = 'request timeout';
var IN_FRIEND_REQUEST = 'wanna be friend';
var IN_ICE_CANDIDATE = 'got ice candy!';

// peer message headers, handshake related
var RELAY_OUT_CONTACT = 'relay out: contact';
var RELAY_OUT_PREPARE_CONTACT = 'relay out: prepare';
var RELAY_OUT_OFFER = 'relay out: offer';
var RELAY_OUT_ANSWER = 'relay out: answer';
var RELAY_IN_OFFER = 'relay in: offer';
var RELAY_IN_ANSWER = 'relay in: answer';
var RELAY_OUT_ICE = 'relay out: ice';
var RELAY_IN_ICE = 'relay in: ice';
var RELAY_IN_PEER_ESTABLISHED = 'relay: established';

// peer message headers, others
var PEER_CHAT = 'chat';

// to broker message headers
var OUT_LEAVE = 'leave';
var OUT_JOIN = 'join';
var OUT_REQUEST_CONTACT = 'can i friend';
var OUT_DENY_REQUEST = 'no friend';
var OUT_MAKE_WEBRTC_OFFER = 'connect me to';
var OUT_ACCEPT_WEBRTC_OFFER = 'i accept gladly';
var OUT_ICE_CANDIDATE = 'give ice candy';

// possible states of contact
var HAS_REQUESTED = 'contact_requested';
var IS_REQUESTED = 'being_hit_on';
var ESTABLISHING = 'establishing_connection';
var ESTABLISHED = 'contact_established';

// peer contact states in the relay
var RELAY_STARTED = 'relay: started';

// peer contact states in the peers
var PEER_OFFERING = 'peer: offering';
var PEER_ANSWERING = 'peer: answering';


//// collection of maps storing various data linked to a specific peer by its id ('peerId').

// the current states of contact between this peer and the other peers of the network.
// undefined if no contact request sent or received, or the received resquest was denied by the user.
var contactStateMap = {};
// webrtc connection handlers, defined once the webrtc handshake starts until the connection is closed.
var connectionHandlers = {};
// webrtc peerconnections
var peerConnections = {};
// webrtc data channels, for now used for the chat
var channels = {};
// nicknames of peers
var nicks = {};
// current states of contact between 2 known peers, in the context of acting as a relay/broker
var relayContactStates = {};


//// broker related var and functions

// websocket connection to the broker
var server = {
    connect : function() {
        var location = document.location.toString().
            replace('http://', 'ws://').
            replace('https://', 'wss://').
            replace('webrtc_websocket_broker.html','servlet/WebSocket');
        //var location = 'ws://localhost:8080/jetty_test/servlet/WebSocket/';
        //alert(location);
        this._ws = new WebSocket(location);
        this._ws.onopen = this._onopen;
        this._ws.onmessage = this._onmessage;
        this._ws.onclose = this._onclose;
    },
    _onopen : function() {
        joinButton.disabled = false;
        server._send('websockets are open for communications!');
    },
    _send : function(message) {
        if (this._ws)
            this._ws.send(message);
    },
    send : function(text) {
        if (text != null && text.length > 0)
            server._send(text);
    },
    _onmessage : onMessage,
    _onclose : function(m) {
        this._ws = null;
    }
};
server.connect();

// broker messages simple parser and handler
function onMessage(msg) {

    function strStartsWith(str, prefix) {
        return str.lastIndexOf(prefix, 0) === 0;
    }

    function extractFirstPayLoad(msg) {
        var startId = msg.indexOf('_', 0)+1;
        var endId = msg.indexOf('_', startId);
        if (endId === -1) {
            endId = msg.length;
        }
        return msg.substr(startId, endId - startId);
    }
    //alert(msg);
    var m = msg.data;
    if (strStartsWith(m, IN_JOINED)) {
        var networkId = extractFirstPayLoad(m);
        trace('Joined a network: ' + networkId);
        networkJoinedUI(networkId);
    } else if (strStartsWith(m, IN_MEMBER_LIST)) {
        var peerListStart = m.indexOf('_', 0)+1;
        var peerList = m.substr(peerListStart, m.length - peerListStart).split(' ');
        trace('Members in network: ' + peerList);
        updateMembersUI(peerList);
    } else if (strStartsWith(m, IN_WEBRTC_ANSWER)) {
        var peerId = extractFirstPayLoad(m);
        trace('Got answer from ' + peerId);
        if (contactStateMap[peerId] !== ESTABLISHING) {
            trace('Got answer from unexpected peer: ' + peerId + ', aborting connection.');
        } else {
            var sdpStartId = (IN_WEBRTC_ANSWER + '_' + peerId + '_').length;
            var sdp = m.substr(sdpStartId, m.length - sdpStartId);
            connectionHandlers[peerId].gotRemoteAnswer(sdp);
        }
    } else if (strStartsWith(m, IN_WEBRTC_OFFER)) {
        var peerId = extractFirstPayLoad(m);
        trace('Got offer from ' + peerId);
        if (contactStateMap[peerId] !== ESTABLISHING
                && contactStateMap[peerId] !== HAS_REQUESTED) {
            // contact not explicitly requested, refuse it
            trace('unrequited love from ' + peerId);
        } else {
            var sdpStartId = (IN_WEBRTC_OFFER + '_' + peerId + '_').length;
            var sdp = m.substr(sdpStartId, m.length - sdpStartId);
            contactStateMap[peerId] = ESTABLISHING;
            connectionHandlers[peerId].gotRemoteOffer(sdp, brokerCreateAnswerCallback(peerId), brokerIceCallback(peerId));
        }
    } else if (strStartsWith(m, IN_REQUEST_TIMEOUT)) {
        var peerId = extractFirstPayLoad(m);
        trace('request timeout with peer: ' + peerId);
        if (contactStateMap[peerId] === HAS_REQUESTED || contactStateMap[peerId] === IS_REQUESTED) {
            delete contactStateMap[peerId];
            updateContactUI();
        }
    } else if (strStartsWith(m, IN_FRIEND_REQUEST)) {
        var peerId = extractFirstPayLoad(m);
        trace('request of contact from peer: ' + peerId);
        if (contactStateMap[peerId] !== ESTABLISHED) {
            contactStateMap[peerId] = IS_REQUESTED;
            updateContactUI();
        }
    } else if (strStartsWith(m, IN_ICE_CANDIDATE)) {
        var peerId = extractFirstPayLoad(m);
        if (contactStateMap[peerId] !== ESTABLISHING
                && contactStateMap[peerId] !== HAS_REQUESTED) {
            trace('unexpected ice candidate from ' + peerId + ', discarded');
        } else {
            trace('got ice candidate from peer: ' + peerId);
            var labelStartId = (IN_ICE_CANDIDATE + '_' + peerId + '_').length;
            var label = m.substr(labelStartId, m.indexOf('_', labelStartId) - labelStartId);
            var candidateStartId = m.indexOf('_', labelStartId) + 1;
            var candidate = m.substr(candidateStartId, m.length - candidateStartId);
            connectionHandlers[peerId].gotRemoteIceCandidate(candidate, label);
        }
    } else {
        trace('Got unsupported msg from broker: ' + m);
    }
}


//// network related functions, calling the broker

// leave the current network
function leave() {
    for (var c in connectionHandlers) {
        trace('deleting handler ' + c);
        connectionHandlers[c].close();
    }
    server.send(OUT_LEAVE);
    networkLeftUI();
}

// join a network
function joinNetwork() {
    var networkId = 'peerHandshake';
    var nick = document.getElementById("nickInput").value;
    if ('' == networkId) {
        alert('Please enter a network id to join.');
    } else {
        server.send(OUT_JOIN + '_' + networkId + '_' + nick);
        if (nick.length == 0) {
            document.getElementById('nickname').innerHTML = '(invisible)';
        } else {
            document.getElementById('nickname').innerHTML = nick;
        }
    }
}

function networkJoinedUI(networkId) {
    document.getElementById('gobetween').style.display = 'block';
    document.getElementById('leaveNetwork').style.display = 'inline';
    document.getElementById('noNetworkHeader').style.display = 'none';
    document.getElementById('joinedHeader').style.display = 'block';
    document.getElementById('nickdiv').style.display = 'none';
    document.getElementById('joinButton').style.display = 'none';
    document.getElementById('members').style.display = 'block';
}

function networkLeftUI(networkId) {
    document.getElementById('gobetween').style.display = 'none';
    document.getElementById('leaveNetwork').style.display = 'none';
    document.getElementById('noNetworkHeader').style.display = 'block';
    document.getElementById('joinedHeader').style.display = 'none';
    document.getElementById('nickdiv').style.display = 'inline';
    document.getElementById('joinButton').style.display = 'block';
    document.getElementById('nickname').innerHTML = '';
    document.getElementById('members').style.display = 'none';
    updateMembersUI([]);
}

function updateMembersUI(peerList) {
    var innerHTML = '<ul>';
    nicks = {};
    for(var i = 0; i < peerList.length; i++) {
        var peer = peerList[i];
        var nickStart = peer.indexOf('-')+1;
        var nick = peer.substr(nickStart, peer.length-nickStart);
        var peerId = peer.substr(0, nickStart-1);
        if (peer.length > 0) {
            nicks[peerId] = nick;
            var contactLink = '  <div id="peercontact' + peerId + '" class="peercontact"></div>';
            innerHTML = innerHTML + '<li><b class="peer" id="peer' + peerId + '">' + nick + '</b>' + contactLink + '</li>';
        }
    }
    innerHTML = innerHTML + '</ul>';
    document.getElementById('peerlist').innerHTML = innerHTML;
    updateContactUI();
}


//// peer related functions, calling the broker

// request contact with a peer
function contact(peerId) {
    server.send(OUT_REQUEST_CONTACT + '_' + peerId);
    contactStateMap[peerId] = HAS_REQUESTED;
    connectionHandlers[peerId] = new ConnectionHandler(peerId);
    updateContactUI();
}

// accept or deny contact with a peer
function acceptContact(accept, peerId) {
    if (accept) {
        contactStateMap[peerId] = ESTABLISHING;
        connectionHandlers[peerId] = new ConnectionHandler(peerId);
        connectionHandlers[peerId].createOffer(brokerCreateOfferCallback(peerId), brokerIceCallback(peerId));
    } else {
        server.send(OUT_DENY_REQUEST + '_' + peerId);
        delete contactStateMap[peerId];
    }
    updateContactUI();
}

// change the peer list according to the state of contact with each peer
function updateContactUI() {
    var contacts = document.getElementsByClassName('peercontact');
    var contactList = '<option></option>';
    for (var i = 0; i < contacts.length; i++) {
        var contact = contacts[i];
        // contact is an element with class 'peercontact'
        // its id is 'peercontactN' where N is the identifier of the peer
        var id = contact.id.substr(11, contact.id.length-1);
        if (contactStateMap[id] === undefined) {
            // no contact with this peer, provide a simple link to initiate contact
            contact.innerHTML = '<a class="contactlink" onclick="contact('+id+')">contact</a>';
        } else if (contactStateMap[id] == HAS_REQUESTED) {
            // the remote peer has been send the request, disable link, provide only a notification text
            contact.innerHTML = '<p class="contactlink">contacted</p>';
        } else if (contactStateMap[id] == IS_REQUESTED) {
            // the remote peer has sent a request of contact, provide a notification and 2 buttons to accept or deny the request
            contact.innerHTML = '<p class="contactlink">is looking out for you! <button onclick="acceptContact(true,'+id+')">Accept</button><button onclick="acceptContact(false,'+id+')">Decline</button></p>';
        } else if (contactStateMap[id] == ESTABLISHING) {
            // the contact request was accepted, provide a simple text to notify of the connection creation
            contact.innerHTML = '<p class="contactlink">establishing connection...</p>';
        } else if (contactStateMap[id] == ESTABLISHED) {
            // restore old values of they exist
            var receiveTextArea = document.getElementById('dataChannelReceive'+id);
            var receiveValue = '';
            if (receiveTextArea) {
                receiveValue = receiveTextArea.value;
            }
            var sendTextArea = document.getElementById('dataChannelSend'+id);
            var sendValue = '';
            if (sendTextArea) {
                sendValue = sendTextArea.value;
            }
            // the connection between the 2 peers was successfully created, show a simple chat interface
            contact.innerHTML = '<a class="contactlink" onclick="connectionHandlers[' + id + '].close()">close</a>' +
            '<div id="sendReceive">'+
              '<div id="receive">'+
                '<textarea class="messaging" id="dataChannelReceive' + id + '" readonly>'+receiveValue+'</textarea>'+
              '</div>'+
              '<div id="send">'+
                '<input class="messaging" id="dataChannelSend' + id + '" placeholder="Type some text then press Enter." onkeydown="if (event.keyCode == 13) connectionHandlers[' + id + '].sendChatMessage()" value="'+sendValue+'"></input>'+
              '</div>'+
            '</div>';
            contactList = contactList + '<option data-id="' + id + '">' + nicks[id] + '</option>';
        } else if (contactStateMap[id] == PEER_OFFERING || contactStateMap[id] == PEER_ANSWERING) {
            // the remote peer has been send the request, disable link, provide only a notification text
            contact.innerHTML = '<p class="contactlink">[p2] establishing connection...</p>';
        } else {
            // unsupported state, nothing to be done
            contact.innerHTML = '';
        }
    }
    var dropdown1 = document.getElementById('introducingList1');
    var dropdown2 = document.getElementById('introducingList2');
    dropdown1.innerHTML = contactList;
    dropdown2.innerHTML = contactList;
}


//// peer hand shake related functions

function updateIntroducingButton() {
    var introButton = document.getElementById('introducingList1');
    var dropdown2 = document.getElementById('introducingList2');
    var dropdown1 = document.getElementById('introducingList1');
    var id2 = dropdown2.options[dropdown2.selectedIndex].getAttribute('data-id');
    var id1 = dropdown1.options[dropdown1.selectedIndex].getAttribute('data-id');
    if (id1 && id2 && id1 !== id2) {
        document.getElementById('introduceButton').disabled = false;
    } else {
        document.getElementById('introduceButton').disabled = true;
    }
}

function introduce() {
    var dropdown2 = document.getElementById('introducingList2');
    var dropdown1 = document.getElementById('introducingList1');
    var id2 = dropdown2.options[dropdown2.selectedIndex].getAttribute('data-id');
    var id1 = dropdown1.options[dropdown1.selectedIndex].getAttribute('data-id');
    trace('Inviting ' + id1 + ' and ' + id2 + ' to get in touch');
    connectionHandlers[id1].sendDataMessage("{'" + RELAY_OUT_PREPARE_CONTACT + "' : '"+id2+"'}");
    connectionHandlers[id2].sendDataMessage("{'" + RELAY_OUT_CONTACT + "' : '" + id1 + "'}");
    relayContactStates[id1 + '_' + id2] = RELAY_STARTED;
    relayContactStates[id2 + '_' + id1] = RELAY_STARTED;
}

//// WEBRTC HANDLER
function ConnectionHandler(peerId) {
    
    this.peerId = peerId;
    
    // public methods
    
    ConnectionHandler.prototype.createOffer = function(createOfferCallback, iceCallback) {
        var peerId = this.peerId;
        var channel = null;
        var peerConnection = new RTCPeerConnection(
            {iceServers:[{url:"stun:stun.l.google.com:19302"}]},
            { optional:[ { RtpDataChannels: true }, {'DtlsSrtpKeyAgreement': true} ], "mandatory": {"MozDontOfferDataChannel": true}});
        
        peerConnections[this.peerId] = peerConnection;
        trace('Created local peer connection, peer target: ' + this.peerId);
    
        try {
            channel = peerConnection.createDataChannel("DataChannel"+this.peerId, { reliable : false });
            channels[this.peerId] = channel;
            trace('Created data channel ' + this.peerId);
        } catch (e) {
            alert('Failed to create data channel. ');
            trace('Create Data channel failed with exception: ' + e.message);
        }
        
        peerConnection.onicecandidate = iceCallback;
        channel.onopen = onDatachannelStateChange(peerId);
        channel.onclose = onDatachannelStateChange(peerId);
        channel.onerror = onDatachannelStateChange(peerId);
        channel.onmessage = onReceiveMessageCallback(peerId);
      
        peerConnection.createOffer(createOfferCallback,
            function(msg){
                trace('Offer creation failed!!');
            });
    };
    
    ConnectionHandler.prototype.gotRemoteOffer = function(sdp, createAnswerCallback, iceCallback) {
        //trace('Got remote offer: ' + sdp);
        var peerConnection = new RTCPeerConnection(
            {iceServers:[{url:"stun:stun.l.google.com:19302"}]},
            { optional:[ { RtpDataChannels: true }, {'DtlsSrtpKeyAgreement': true} ], "mandatory": {"MozDontOfferDataChannel": true}});
        var peerId = this.peerId;
        
        peerConnections[peerId] = peerConnection;
      
        peerConnection.ondatachannel = datachannelCallback(peerId);
        peerConnection.onicecandidate = iceCallback;

        var remoteDesc = new RTCSessionDescription({sdp:sdp, type:'offer'});
        peerConnection.setRemoteDescription(remoteDesc,
            function(arg0){
                trace("Set remote description success");
            },
            function(arg0){
                trace("Set remote description failure");
            });
        trace('Remote description set, from offer of ' + peerId);
        peerConnection.createAnswer(createAnswerCallback,
            function(msg){
                trace('Answer creation answer failed!!');
            });
    };
    
    ConnectionHandler.prototype.gotRemoteAnswer = function(sdp) {
        var remoteDesc = new RTCSessionDescription({sdp: sdp, type: 'answer'});
        peerConnections[this.peerId].setRemoteDescription(remoteDesc);
        trace('Remote description set, from answer of ' + this.peerId);
    };
    
    ConnectionHandler.prototype.sendChatMessage = function() {
        var sendTextArea = document.getElementById("dataChannelSend"+this.peerId);
        var chatMessage = sendTextArea.value;
        var data = '{ "'+PEER_CHAT+'" : "' + escape(chatMessage) + '" }';
        this.sendDataMessage(data);
        sendTextArea.value = '';
        var chatArea = document.getElementById("dataChannelReceive"+this.peerId);
        var text = chatArea.value;
        text = text + 'you: ' + chatMessage + '\r\n';
        document.getElementById("dataChannelReceive"+this.peerId).value = text;
    };
    
    ConnectionHandler.prototype.sendDataMessage = function(data) {
        trace('Sending Data to ' + this.peerId + ': ' + data);
        trace('Data length: ' + data.length);
        channels[this.peerId].send(data);
    };
    
    ConnectionHandler.prototype.close = function() {
        var peerId = this.peerId;
        connectionClose(peerId);
        updateContactUI(peerId);
    };
    
    ConnectionHandler.prototype.gotRemoteIceCandidate = function(iceCandidate, label) {
        trace('got remote ice candidate, label: ' + label + ', candidate: ' + iceCandidate);
        var initializer = {candidate:iceCandidate, sdpMLineIndex: label};
        var candidate = new RTCIceCandidate(initializer);
        candidate.candidate = iceCandidate;
        peerConnections[this.peerId].addIceCandidate(candidate);
    }
}    

// peerconnection callbacks

function datachannelCallback(peerId) {
    return function(event) {
        trace('Datachannel Callback with peer ' + peerId);
        var channel = event.channel;
        channels[peerId] = channel;
        channel.onmessage = onReceiveMessageCallback(peerId);
        channel.onopen = onDatachannelStateChange(peerId);
        channel.onerror = onDatachannelStateChange(peerId);
        channel.onclose = onDatachannelStateChange(peerId);
    }
}

// broker handshake callbacks

function brokerCreateOfferCallback(peerId) {
    return function(desc){
        peerConnections[peerId].setLocalDescription(desc);
        trace('Local description set, sending offer to ' + peerId);
        server.send(OUT_MAKE_WEBRTC_OFFER + '_' + peerId + '_' + desc.sdp);
        //trace('Sent offer: ' + desc.sdp);
    };
}

function brokerCreateAnswerCallback(peerId) {
    return function(desc){
        peerConnections[peerId].setLocalDescription(desc);
        trace('Local description set, sending answer to ' + peerId);
        server.send(OUT_ACCEPT_WEBRTC_OFFER + '_' + peerId + '_' + desc.sdp);
    };
}

function brokerIceCallback(peerId){
    return function (event) { 
        trace('local ice callback');
        if (event.candidate) {
            trace('Sending ICE candidate via broker: \n' + event.candidate.candidate);
            server.send(OUT_ICE_CANDIDATE + '_' + peerId + '_' + event.candidate.sdpMLineIndex + '_' + event.candidate.candidate);
        }
    }
}

// peer handshake callbacks

function peerRelayCreateOfferCallback(peerId, relayId) {
    return function(desc){
        peerConnections[peerId].setLocalDescription(desc);
        trace('Local description set, sending offer through ' + relayId + ' to ' + peerId);
        var data = "{'" + RELAY_IN_OFFER + "' : ['" + peerId + "', '" + escape(desc.sdp) + "']}";
        connectionHandlers[relayId].sendDataMessage(data);
    };
}

function peerRelayCreateAnswerCallback(peerId, relayId) {
    return function(desc){
        peerConnections[peerId].setLocalDescription(desc);
        trace('Local description set, sending answer through ' + relayId + ' to ' + peerId);
        connectionHandlers[relayId].sendDataMessage("{'" + RELAY_IN_ANSWER + "' : ['" + peerId + "', '" + escape(desc.sdp) + "']}");
    };
}

function peerRelayIceCallback(peerId, relayId){
    return function (event) { 
        trace('local ice callback');
        if (event.candidate) {
            trace('Sending ICE candidate via peer relay ' + relayId + ': \n' + event.candidate.candidate);
            connectionHandlers[relayId].sendDataMessage("{'" + RELAY_IN_ICE + "' : ['" + peerId + "', '" + escape(event.candidate.sdpMLineIndex) + "', '" + escape(event.candidate.candidate) + "']}");
        }
    }
}

// data channel callbacks

function connectionClose(peerId) {
    peerConnections[peerId].close();
    trace('Closed connection with peer ' + peerId);
    delete peerConnections[peerId];
    delete contactStateMap[peerId];
    delete connectionHandlers[peerId];
}
    
function onDatachannelStateChange(peerId) {
    return function() {
        var readyState = channels[peerId].readyState;
        trace('datachannel (' + peerId + ') state is: ' + readyState);
        if (readyState.toLowerCase() == "open") {
            contactStateMap[peerId] = ESTABLISHED;
        } else {
            if (peerConnections[peerId]) {
                connectionClose(peerId);
            }
        }
        updateContactUI();
    }
}

function onReceiveMessageCallback(peerId) {
    return function(event) {
        trace('Received Message from remote peer ' + peerId);
        var msg = {};
        try {
            //trace(event.data);
            msg = eval( '(' + event.data + ')' );
        } catch (e) {
            trace('Exception parsing the message: ' + e.message);
            return;
        }
        // simple chat message support
        if (msg[PEER_CHAT]) {
            trace('chat msg');
            var chatText = msg[PEER_CHAT];
            var text = document.getElementById("dataChannelReceive"+peerId).value;
            text = text + nicks[peerId] + ': ' + unescape(chatText) + '\r\n';
            document.getElementById("dataChannelReceive"+peerId).value = text;    
        } else
        // p2p relay/handshake handling
        if (msg[RELAY_OUT_CONTACT]) {
            var otherPeerId = msg[RELAY_OUT_CONTACT];
            trace('request to contact ' + otherPeerId);
            if (contactStateMap[otherPeerId]) {
                // some contact is already happening, do no interfere
                trace('discarded as busy');
            } else {
                contactStateMap[otherPeerId] = PEER_OFFERING;
                connectionHandlers[otherPeerId] = new ConnectionHandler(otherPeerId);
                connectionHandlers[otherPeerId].createOffer(peerRelayCreateOfferCallback(otherPeerId, peerId), peerRelayIceCallback(otherPeerId, peerId));
                updateContactUI();
            }
        } else if (msg[RELAY_OUT_PREPARE_CONTACT]) {
            var otherPeerId = msg[RELAY_OUT_PREPARE_CONTACT];
            trace('request to prepare contact for ' + otherPeerId);
            if (contactStateMap[otherPeerId]) {
                // some contact is already happening, do no interfere
                trace('discarded as busy');
            } else {
                contactStateMap[otherPeerId] = PEER_ANSWERING;
                // no more, wait for the offer to come
                updateContactUI();
            }
        } else if (msg[RELAY_OUT_OFFER]) {
            var otherPeerId = msg[RELAY_OUT_OFFER][0];
            trace('sending p2p offer to ' + otherPeerId);
            if (contactStateMap[otherPeerId] === PEER_ANSWERING) {
                connectionHandlers[otherPeerId] = new ConnectionHandler(otherPeerId);
                connectionHandlers[otherPeerId].gotRemoteOffer(unescape(msg[RELAY_OUT_OFFER][1]), peerRelayCreateAnswerCallback(otherPeerId, peerId), peerRelayIceCallback(otherPeerId, peerId));
            } else {
                // discarding
                trace('discarded as wrong state');
            }
        } else if (msg[RELAY_IN_OFFER]) {
            var otherPeerId = msg[RELAY_IN_OFFER][0];
            trace('forwarding a p2p offer');
            if (relayContactStates[peerId + '_' + otherPeerId] === RELAY_STARTED) {
                // forward the offer to the otherPeerId
                connectionHandlers[otherPeerId].sendDataMessage("{'" + RELAY_OUT_OFFER + "' : ['" + peerId + "', '" + msg[RELAY_IN_OFFER][1] + "']}");
            } else {
                // discarding
                trace('discarded as wrong state');
            }
        } else if (msg[RELAY_OUT_ANSWER]) {
            var otherPeerId = msg[RELAY_OUT_ANSWER][0];
            trace('sending p2p answer to ' + otherPeerId);
            if (contactStateMap[otherPeerId] === PEER_OFFERING) {
                connectionHandlers[otherPeerId].gotRemoteAnswer(unescape(msg[RELAY_OUT_ANSWER][1]));
            } else {
                // discarding
                trace('discarded as wrong state');
            }
        } else if (msg[RELAY_IN_ANSWER]) {
            var otherPeerId = msg[RELAY_IN_ANSWER][0];
            trace('forwarding a p2p answer');
            if (relayContactStates[peerId + '_' + otherPeerId] === RELAY_STARTED) {
                // forward the answer to the otherPeerId
                connectionHandlers[otherPeerId].sendDataMessage("{'" + RELAY_OUT_ANSWER + "' : ['" + peerId + "', '" + msg[RELAY_IN_ANSWER][1] + "']}");
            } else {
                // discarding
                trace('discarded as wrong state');
            }
        } else if (msg[RELAY_OUT_ICE]) {
            var otherPeerId = msg[RELAY_OUT_ICE][0];
            trace('forwarding p2p ice');
            if (contactStateMap[otherPeerId] === PEER_OFFERING ||
                contactStateMap[otherPeerId] === PEER_ANSWERING) {
                connectionHandlers[otherPeerId].gotRemoteIceCandidate(unescape(msg[RELAY_OUT_ICE][1]), unescape(msg[RELAY_OUT_ICE][2]));
            } else {
                // discarding
                trace('discarded as wrong state');
            }
        } else if (msg[RELAY_IN_ICE]) {
            var otherPeerId = msg[RELAY_IN_ICE][0];
            trace('got p2p ice');
            if (relayContactStates[peerId + '_' + otherPeerId] === RELAY_STARTED) {
                // forward the ice to the otherPeerId
                connectionHandlers[otherPeerId].sendDataMessage("{'" + RELAY_OUT_ICE + "' : ['" + peerId + "', '" + msg[RELAY_IN_ICE][1] + "', '" + msg[RELAY_IN_ICE][2] + "']}");
            } else {
                // discarding
                trace('discarded as wrong state');
            }
        }
        // other messages
        else {
            trace('Unsupported message: ' + msg);
        }
    }
}