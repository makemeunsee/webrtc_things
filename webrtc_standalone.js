var channel1to2, channel2to1;
startButton.disabled = false;
sendButton1to2.disabled = true;
sendButton2to1.disabled = true;
closeButton.disabled = true;

function createConnection() {
  window.pc1 = new mozRTCPeerConnection();
  trace('Created local peer connection object pc1');

  try {
    channel1to2 = window.pc1.createDataChannel("sendDataChannel");
    trace('Created send data channel');
  } catch (e) {
    alert('Failed to create data channel. ');
    trace('Create Data channel failed with exception: ' + e.message);
  }
  //window.pc1.onicecandidate = iceCallback1;
  channel1to2.onopen = onchannel1to2StateChange;
  channel1to2.onclose = onchannel1to2StateChange;
  channel1to2.onmessage = onReceiveMessageFrom2Callback;

  window.pc2 = new mozRTCPeerConnection();
  trace('Created remote peer connection object pc2');

  //pc2.onicecandidate = iceCallback2;
  pc2.ondatachannel = channel2to1Callback;

  window.pc1.createOffer(gotDescription1);
  startButton.disabled = true;
  closeButton.disabled = false;
}

function sendData1to2() {
  var data = document.getElementById("peer1_dataChannelSend").value;
  channel1to2.send(data);
  trace('Sent Data from 1 to 2: ' + data);
}

function sendData2to1() {
  var data = document.getElementById("peer2_dataChannelSend").value;
  channel2to1.send(data);
  trace('Sent Data from 2 to 1: ' + data);
}

function closeDataChannels() {
  trace('Closing data Channels');
  channel1to2.close();
  trace('Closed data channel with label: ' + channel1to2.label);
  channel2to1.close();
  trace('Closed data channel with label: ' + channel2to1.label);
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  trace('Closed peer connections');
  startButton.disabled = false;
  sendButton1to2.disabled = true;
  sendButton2to1.disabled = true;
  closeButton.disabled = true;
  peer1_dataChannelSend.value = "";
  peer1_dataChannelReceive.value = "";
  peer2_dataChannelReceive.value = "";
  peer2_dataChannelSend.value = "";
  peer1_dataChannelSend.disabled = true;
  peer1_dataChannelSend.placeholder = "Press Start, enter some text, then press Send 1.";
  peer2_dataChannelSend.disabled = true;
  peer2_dataChannelSend.placeholder = "Press Start, enter some text, then press Send 2.";
}

function gotDescription1(desc) {
  trace('Offer from pc1 \n' + desc.sdp);
  pc1.setLocalDescription(desc);
  trace('Local description for pc1 set');
  pc2.setRemoteDescription(desc);
  trace('Remote description for pc2 set');
  pc2.createAnswer(gotDescription2);
}

function gotDescription2(desc) {
  pc2.setLocalDescription(desc);
  trace('Local description for pc2 set');
  trace('Answer from pc2 \n' + desc.sdp);
  pc1.setRemoteDescription(desc);
  trace('Remote description for pc1 set');
}

/*function iceCallback1(event) {
  trace('local ice callback');
  if (event.candidate) {
    pc2.addIceCandidate(event.candidate);
    trace('Local ICE candidate: \n' + event.candidate.candidate);
  }
}

function iceCallback2(event) {
  trace('remote ice callback');
  if (event.candidate) {
    pc1.addIceCandidate(event.candidate);
    trace('Remote ICE candidate: \n ' + event.candidate.candidate);
  }
}*/

function channel2to1Callback(event) {
  trace('Receive Channel Callback');
  channel2to1 = event.channel;
  channel2to1.onmessage = onReceiveMessageFrom1Callback;
  channel2to1.onopen = onchannel2to1StateChange;
  channel2to1.onclose = onchannel2to1StateChange;
}

function onReceiveMessageFrom1Callback(event) {
  trace('Received Message from 1');
  document.getElementById("peer2_dataChannelReceive").value = event.data;
}

function onReceiveMessageFrom2Callback(event) {
  trace('Received Message from 2');
  document.getElementById("peer1_dataChannelReceive").value = event.data;
}

function onchannel1to2StateChange() {
  var readyState = channel1to2.readyState;
  trace('Send channel1to2 state is: ' + readyState);
  if (readyState.toLowerCase() == "open") {
    peer1_dataChannelSend.disabled = false;
    peer1_dataChannelSend.focus();
    peer1_dataChannelSend.placeholder = "";
    sendButton1to2.disabled = false;
    //sendButton2to1.disabled = false;
    //closeButton.disabled = false;
  } else {
    peer1_dataChannelSend.disabled = true;
    sendButton1to2.disabled = true;
    //sendButton2to1.disabled = true;
    //closeButton.disabled = true;
  }
}

function onchannel2to1StateChange() {
  var readyState = channel2to1.readyState;
  trace('Receive channel1to2 state is: ' + readyState);
  if (readyState.toLowerCase() == "open") {
    peer2_dataChannelSend.disabled = false;
    peer2_dataChannelSend.focus();
    peer2_dataChannelSend.placeholder = "";
    sendButton2to1.disabled = false;
  } else {
    peer2_dataChannelSend.disabled = true;
    sendButton2to1.disabled = true;
  }
}
