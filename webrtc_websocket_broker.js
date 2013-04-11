document.getElementById('joinedHeader').style.display = 'none';
document.getElementById('leaveNetwork').style.display = 'none';
document.getElementById('members').style.display = 'none';

var contactStateMap = new Object();
var connectionHandlerMap = new Object();

function strStartsWith(str, prefix) {
  return str.lastIndexOf(prefix, 0) === 0;
}

var server = {
    connect : function() {
        var location = document.location.toString().
            replace('http://', 'ws://').
            replace('https://', 'wss://').
            replace('webrtc_websocket_broker.html','servlet/WebSocket');
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
    _onmessage : function(msg) {
        //alert(msg);
        var m = msg.data;
        if (strStartsWith(m, 'in network with id_')) {
          trace('Joined a network: ' + m);
          var networkIdStart = m.indexOf('_', 0)+1;
          var networkIdEnd = m.indexOf('_', networkIdStart);
          var networkId = m.substr(networkIdStart, networkIdEnd-networkIdStart);
          networkJoinedUI(networkId);
        } else if (strStartsWith(m, 'members of network_')) {
          trace('members: ' + m);
          var memberListStart = m.indexOf('_', 0)+1;
          var memberList = m.substr(memberListStart, m.length-memberListStart).split(' ');
          updateMembersUI(memberList);
        } else if (strStartsWith(m, 'answer from_')) {
          var peerIdStart = m.indexOf('_', 0)+1;
          var peerIdEnd = m.indexOf('_', peerIdStart);
          var peerId = m.substr(peerIdStart, peerIdEnd-peerIdStart);
          trace('Got answer from ' + peerId);
          if (contactStateMap[peerId] !== 'establishing_connection') {
            trace('Got answer from not expected peer: ' + peerId + ', aborting connection.');
          } else {
            var sdp = m.substr(peerIdEnd+1, m.length-peerIdEnd-1);
            connectionHandlerMap[peerId].gotRemoteAnswer(sdp);
          }
        } else if (strStartsWith(m, 'offer from_')) {
          var peerIdStart = m.indexOf('_', 0)+1;
          var peerIdEnd = m.indexOf('_', peerIdStart);
          var peerId = m.substr(peerIdStart, peerIdEnd-peerIdStart);
          trace('Got offer from ' + peerId);
          if (contactStateMap[peerId] !== 'establishing_connection'
                && contactStateMap[peerId] !== 'contact_requested') {
            // contact not explicitly requested, refuse it
            trace('unrequited love from ' + peerId);
          } else {
            var sdp = m.substr(peerIdEnd+1, m.length-peerIdEnd-1);
            contactStateMap[peerId] = 'establishing_connection';
            connectionHandlerMap[peerId].gotRemoteOffer(sdp);
          }
        } else if (strStartsWith(m, 'request timeout_')) {
          var peerIdStart = m.indexOf('_', 0)+1;
          var peerId = m.substr(peerIdStart, m.length-peerIdStart);
          trace('request timeout with member: ' + peerId);
          if (contactStateMap[peerId] === 'contact_requested' || contactStateMap[peerId] === 'being_hit_on') {
            delete contactStateMap[peerId];
            updateContactUI();
          }
        } else if (strStartsWith(m, 'wanna be friend_')) {
          var peerIdStart = m.indexOf('_', 0)+1;
          var peerId = m.substr(peerIdStart, m.length-peerIdStart);
          trace('request of contact from member: ' + peerId);
          if (contactStateMap[peerId] !== 'contact_established') {
            contactStateMap[peerId] = 'being_hit_on';
            updateContactUI();
          }
        } else {
          trace('Got unsupported msg from broker: ' + m);
        }
    },
    _onclose : function(m) {
        this._ws = null;
    }
};
server.connect();

function leave() {
	for (var c in connectionHandlerMap) {
		trace('deleting handler ' + c);
		connectionHandlerMap[c].close();
	}
    server.send('leave');
    networkLeftUI();
}

function networkJoinedUI(networkId) {
    document.getElementById('leaveNetwork').style.display = 'inline';
    document.getElementById('noNetworkHeader').style.display = 'none';
    document.getElementById('joinedHeader').style.display = 'block';
    document.getElementById('networkName').innerHTML = networkId;
    document.getElementById('networkinputdiv').style.display = 'none';
    document.getElementById('nickdiv').style.display = 'none';
    document.getElementById('joinButton').style.display = 'none';
    document.getElementById('members').style.display = 'block';
}

function networkLeftUI(networkId) {
    document.getElementById('leaveNetwork').style.display = 'none';
    document.getElementById('noNetworkHeader').style.display = 'block';
    document.getElementById('joinedHeader').style.display = 'none';
    document.getElementById('networkinputdiv').style.display = 'inline';
    document.getElementById('nickdiv').style.display = 'inline';
    document.getElementById('joinButton').style.display = 'block';
    document.getElementById('nickname').innerHTML = '';
    document.getElementById('members').style.display = 'none';
    updateMembersUI([]);
}

function updateMembersUI(memberList) {
    var innerHTML = '<ul>';
    for(var i = 0; i < memberList.length; i++) {
        var member = memberList[i];
        var nickStart = member.indexOf('-')+1;
        var nick = member.substr(nickStart, member.length-nickStart);
        var memberId = member.substr(0, nickStart-1);
        if (member.length > 0) {
            var contactLink = '  <div id="peercontact' + memberId + '" class="peercontact"></div>';
            innerHTML = innerHTML + '<li><b class="peer" id="peer' + memberId + '">' + nick + '</b>' + contactLink + '</li>';
        }
    }
    innerHTML = innerHTML + '</ul>';
    document.getElementById('peerlist').innerHTML = innerHTML;
    updateContactUI();
}

function contact(memberId) {
    server.send('can i friend_' + memberId);
    contactStateMap[memberId] = 'contact_requested';
    connectionHandlerMap[memberId] = new ConnectionHandler(memberId);
    updateContactUI();
}

function acceptContact(accept, memberId) {
    if (accept) {
        contactStateMap[memberId] = 'establishing_connection';
        connectionHandlerMap[memberId] = new ConnectionHandler(memberId);
        connectionHandlerMap[memberId].createOffer();
    } else {
        server.send('no friend_' + memberId);
        delete contactStateMap[memberId];
    }
    updateContactUI();
}

function updateContactUI() {
    var contacts = document.getElementsByClassName('peercontact');
    for (var i = 0; i < contacts.length; i++) {
        var contact = contacts[i];
        // contact is an element with class 'peercontact'
        // its id is 'peercontactN' where N is the identifier of the member
        var id = contact.id.substr(11, contact.id.length-1);
        if (contactStateMap[id] === undefined) {
            contact.innerHTML = '<a class="contactlink" onclick="contact('+id+')">contact</a>';
        } else if (contactStateMap[id] == 'contact_requested') {
            contact.innerHTML = '<p class="contactlink">contacted</p>';
        } else if (contactStateMap[id] == 'being_hit_on') {
            contact.innerHTML = '<p class="contactlink">is looking out for you! <button onclick="acceptContact(true,'+id+')">Accept</button><button onclick="acceptContact(false,'+id+')">Decline</button></p>';
        } else if (contactStateMap[id] == 'contact_established') {
            contact.innerHTML = '<a class="contactlink" onclick="connectionHandlerMap[' + id + '].close()">close</a>' +
            '<div id="sendReceive">'+
              '<div id="receive">'+
                '<textarea class="messaging" id="dataChannelReceive' + id + '" readonly></textarea>'+
              '</div>'+
              '<div id="send">'+
                '<input class="messaging" id="dataChannelSend' + id + '" placeholder="Type some text then press Enter." onkeydown="if (event.keyCode == 13) connectionHandlerMap[' + id + '].sendData()"></input>'+
              '</div>'+
            '</div>';
        } else if (contactStateMap[id] == 'establishing_connection') {
        	contact.innerHTML = 'establishing connection...';
        } else {
            contact.innerHTML = '';
        }
    }
}

function joinNetwork() {
	var networkId = document.getElementById("networkInput").value;
	var nick = document.getElementById("nickInput").value;
	if ('' == networkId) {
		alert('Please enter a network id to join.');
	} else {
		server.send('join_' + networkId + '_' + nick);
		if (nick.length == 0) {
 	      document.getElementById('nickname').innerHTML = '(invisible)';
		} else {
			document.getElementById('nickname').innerHTML = nick;
		}
	}
}

//// WEBRTC HANDLER
function ConnectionHandler(peerId) {
	
	this.peerId = peerId;
	this.peerConnection = null;
	this.channel = null;
	
	// public methods
	
	ConnectionHandler.prototype.createOffer = function createOffer() {
		peerConnection = new mozRTCPeerConnection();
		trace('Created local peer connection, peer target: ' + peerId);
	
		try {
			channel = peerConnection.createDataChannel("DataChannel"+peerId);
			trace('Created data channel ' + peerId);
		} catch (e) {
			alert('Failed to create data channel. ');
			trace('Create Data channel failed with exception: ' + e.message);
		}
		channel.onopen = onDatachannelStateChange;
		channel.onclose = onDatachannelStateChange;
		channel.onmessage = onReceiveMessageCallback;
	  
		peerConnection.createOffer(gotOffer);
	};
	
	
	ConnectionHandler.prototype.gotRemoteOffer = function(sdp) {
		peerConnection = new mozRTCPeerConnection();
	  
		peerConnection.ondatachannel = datachannelCallback;
		var remoteDesc = new mozRTCSessionDescription();
		remoteDesc.sdp = sdp;
		remoteDesc.type = "offer";
		peerConnection.setRemoteDescription(remoteDesc);
		trace('Remote description set, from offer of ' + peerId);
		peerConnection.createAnswer(gotAnswer);
	};
	
	ConnectionHandler.prototype.gotRemoteAnswer = function(sdp) {
		var remoteDesc = new mozRTCSessionDescription();
		remoteDesc.sdp = sdp;
		remoteDesc.type = "answer";
		peerConnection.setRemoteDescription(remoteDesc);
		trace('Remote description set, from answer of ' + peerId);
	};
	
	ConnectionHandler.prototype.sendData = function() {
		var sendTextArea = document.getElementById("dataChannelSend"+peerId);
		var data = sendTextArea.value;
		sendTextArea.value = '';
		//sendTextArea.focus();
		//sendTextArea.setSelectionRange(0,0);
		channel.send(data);
		trace('Sent Data to ' + peerId + ': ' + data);
	};
	
	ConnectionHandler.prototype.close = function() {
		if (channel !== null) {
			trace('Closing data channel with peer ' + peerId);
			channel.close();
			trace('Closed data channel with label: ' + channel.label);
		}
		connectionClose();
	};

	// private methods
	
	function connectionClose() {
		peerConnection.close();
		peerConnection = null;
		trace('Closed peer connection with peer ' + peerId);
		oncloseUI();
	}
		
	function gotOffer(desc) {
	  //trace('Offer description (locally created)\n' + desc.sdp);
	  peerConnection.setLocalDescription(desc);
	  trace('Local description set, sending offer to ' + peerId);
	  
	  server.send("connect me to_" + peerId + "_" + desc.sdp);
	}
	
	function oncloseUI() {
		trace('oncloseUI ' + peerId);
		delete contactStateMap[peerId];
		delete connectionHandlerMap[peerId];
		updateContactUI();
	}
	
	function onDatachannelStateChange() {
		var readyState = channel.readyState;
		trace('datachannel (' + peerId + ') state is: ' + readyState);
		if (readyState.toLowerCase() == "open") {
			contactStateMap[peerId] = 'contact_established';
			updateContactUI();
		} else {
			connectionClose();
		}
	}
	
	function onReceiveMessageCallback(event) {
	  trace('Received Message from remote peer ' + peerId);
	  document.getElementById("dataChannelReceive"+peerId).value = event.data;
	}
	
	function gotAnswer(desc) {
	  //trace('Answer description (locally created)\n' + desc.sdp);
	  peerConnection.setLocalDescription(desc);
	  trace('Local description set, sending answer to ' + peerId);
	  
	  server.send("i accept gladly_" + peerId + "_" + desc.sdp);
	}
	
	function datachannelCallback(event) {
	  trace('Datachannel Callback with peer ' + peerId);
	  channel = event.channel;
	  channel.onmessage = onReceiveMessageCallback;
	  channel.onopen = onDatachannelStateChange;
	  channel.onclose = onDatachannelStateChange;
	}
}