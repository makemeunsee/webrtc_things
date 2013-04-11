var channel;
startButton.disabled = false;
sendButton.disabled = true;
closeButton.disabled = true;
document.getElementById('buttons').style.display = 'none';
document.getElementById('localDescriptionText').style.display = 'none';
document.getElementById('sendReceive').style.display = 'none';
document.getElementById('output').style.display = 'none';

function createOffer() {
  document.getElementById('startButton').style.display = 'none';
  document.getElementById('bigOr').style.display = 'none';
  document.getElementById('input').style.display = 'none';
  document.getElementById('localDescriptionText').style.display = 'block';
  
  window.pc1 = new mozRTCPeerConnection();
  trace('Created local peer connection object pc1');

  document.getElementById("localDescriptionText").value = "creating offer";
  
  try {
    channel = window.pc1.createDataChannel("DataChannel");
    trace('Created send data channel');
  } catch (e) {
    alert('Failed to create data channel. ');
    trace('Create Data channel failed with exception: ' + e.message);
  }
  //window.pc1.onicecandidate = iceCallback1;
  channel.onopen = onDatachannelStateChange;
  channel.onclose = onDatachannelStateChange;
  channel.onmessage = onReceiveMessageCallback;
  
  window.pc1.createOffer(gotOffer);
  startButton.disabled = true;
  closeButton.disabled = false;
}

function gotOffer(desc) {
  //trace('Offer description\n' + desc.sdp);
  pc1.setLocalDescription(desc);
  trace('Local description set');
  
  document.getElementById('inputHeader').innerHTML = "Input answer";
  document.getElementById('inputButton').innerHTML = "Input answer";
  document.getElementById('inputButton').onclick = function() {inputAnswer()};
  document.getElementById('input').style.display = 'block';
  document.getElementById('localDescriptionText').value = desc.sdp;
}

function onDatachannelStateChange() {
  var readyState = channel.readyState;
  trace('datachannel state is: ' + readyState);
  if (readyState.toLowerCase() == "open") {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    dataChannelReceive.value = "";
    sendButton.disabled = false;
  } else {
    dataChannelReceive.value = "Connection closed";
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

function onReceiveMessageCallback(event) {
  trace('Received Message from remote peer');
  document.getElementById("dataChannelReceive").value = event.data;
}

function inputOffer() {
  document.getElementById('startButton').style.display = 'none';
  document.getElementById('bigOr').style.display = 'none';
  document.getElementById('createOffer').style.display = 'none';
  
  var remoteDesc = new Object();
  remoteDesc.sdp = document.getElementById("inputText").value;
  //trace('Remote description \n' + remoteDesc.sdp);
  remoteDesc.type = "offer";
  
  window.pc1 = new mozRTCPeerConnection();
  //pc1.onicecandidate = iceCallback1;
  pc1.ondatachannel = datachannelCallback;
  pc1.setRemoteDescription(remoteDesc);
  trace('Remote description set');
  pc1.createAnswer(gotAnswer);
  
  document.getElementById('output').style.display = 'block';
  document.getElementById('outputText').value = "creating answer";
  document.getElementById('input').style.display = 'none';
}

function inputAnswer() {
  var data = document.getElementById("inputText").value;
  //trace('Remote description \n' + data);
  
  var remoteDesc = new Object();
  remoteDesc.__exposedProps__ = new Object();
  remoteDesc.__exposedProps__.type = "rw";
  remoteDesc.__exposedProps__.sdp = "rw";
  remoteDesc.sdp = data;
  remoteDesc.type = "answer";
  pc1.setRemoteDescription(remoteDesc);
  trace('Remote description set');
}

function gotAnswer(desc) {
  //trace('Local description\n' + desc.sdp);
  pc1.setLocalDescription(desc);
  trace('Local description set');
  
  document.getElementById("outputText").value = desc.sdp;
}

function datachannelCallback(event) {
  trace('Datachannel Callback');
  channel = event.channel;
  channel.onmessage = onReceiveMessageCallback;
  channel.onopen = onDatachannelStateChange;
  channel.onclose = onDatachannelStateChange;
}

function sendData() {
  var data = document.getElementById("dataChannelSend").value;
  channel.send(data);
  trace('Sent Data: ' + data);
}

function closeDataChannel() {
  trace('Closing data Channel');
  channel();
  trace('Closed data channel with label: ' + channel.label);
  pc1.close();
  pc1 = null;
  trace('Closed peer connection');
  startButton.disabled = false;
  sendButton.disabled = true;
  closeButton.disabled = true;
  dataChannelSend.value = "";
  dataChannelReceive.value = "";
  dataChannelSend.disabled = true;
  peer1_dataChannelSend.placeholder = "Set the remote description, enter some text, then press Send.";
}