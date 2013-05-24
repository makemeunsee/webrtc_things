var channel;
startButton.disabled = true;
document.getElementById('buttons').style.display = 'none';
document.getElementById('localDescriptionText').style.display = 'none';
document.getElementById('localDescriptionText').value = '';
document.getElementById('inputText').value = '';
document.getElementById('outputText').value = '';
document.getElementById('dataChannelSend').value = '';
document.getElementById('dataChannelReceive').value = '';
document.getElementById('sendReceive').style.display = 'none';
document.getElementById('output').style.display = 'none';

var cfg = {"iceServers":[{"url":"stun:23.21.150.121"}]},
    con = { 'optional': [{'DtlsSrtpKeyAgreement': true}, {'RtpDataChannels': true }] },
    ignoreIce = false;
    
var peerConnection = new RTCPeerConnection(cfg, con);
peerConnection.onconnection = handleOnconnection;
peerConnection.onicecandidate = function (e) {
  if (!ignoreIce) {
    trace("ICE candidate: ", e);
    if (e.candidate && !ignoreIce) {
      peerConnection.addIceCandidate(iceCandidate);
    }
  }
};
getUserMedia({'audio':true, fake:true}, function (stream) {
    trace("Got local audio", stream);
    peerConnection.addStream(stream);
    createOffer();
}, function (e) { trace("No audio"); });

function handleOnconnection() {
  trace("Connection opened");
}
    
function createOffer() {
  document.getElementById("localDescriptionText").value = "creating offer";
  ignoreIce = true;
  try {
    channel = peerConnection.createDataChannel("DataChannel", { reliable : false });
    trace('Created send data channel');
  } catch (e) {
    alert('Failed to create data channel. ');
    trace('Create Data channel failed with exception: ' + e.message);
  }
  channel.onopen = onDatachannelStateChange;
  channel.onclose = onDatachannelStateChange;
  channel.onmessage = onReceiveMessageCallback;
  
  peerConnection.createOffer(gotOffer);
}

function gotOffer(desc) {
  //trace('Offer description\n' + desc.sdp);
  peerConnection.setLocalDescription(desc);
  trace('Local description set');
  document.getElementById('localDescriptionText').style.display = 'block';
  document.getElementById('localDescriptionText').value = desc.sdp;
  startButton.disabled = false;
}

function create() {
  document.getElementById('startButton').style.display = 'none';
  document.getElementById('bigOr').style.display = 'none';
  document.getElementById('input').style.display = 'none';
  
  document.getElementById('inputHeader').innerHTML = "Input answer";
  document.getElementById('inputButton').innerHTML = "Input answer";
  document.getElementById('inputButton').onclick = function() {inputAnswer()};
  document.getElementById('input').style.display = 'block';
  startButton.disabled = true;
}

function onDatachannelStateChange() {
  var readyState = channel.readyState;
  trace('datachannel state is: ' + readyState);
  if (readyState.toLowerCase() == "open") {
    document.getElementById('buttons').style.display = 'block';
    document.getElementById('sendReceive').style.display = 'block';
    document.getElementById('createOffer').style.display = 'none';
    document.getElementById('input').style.display = 'none';
    document.getElementById('output').style.display = 'none';
    document.getElementById('bigOr').style.display = 'none';
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    dataChannelReceive.value = "";
  } else {
    document.getElementById('buttons').style.display = 'none';
    document.getElementById('sendReceive').style.display = 'none';
    document.getElementById('createOffer').style.display = 'block';
    document.getElementById('input').style.display = 'block';
    document.getElementById('output').style.display = 'block';
    document.getElementById('bigOr').style.display = 'block';
    dataChannelReceive.value = "Connection closed";
    dataChannelSend.disabled = true;
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
  
  peerConnection = new RTCPeerConnection(cfg, con);
  //peerConnection.onicecandidate = iceCallback1;
  peerConnection.ondatachannel = datachannelCallback;
  peerConnection.setRemoteDescription(remoteDesc);
  trace('Remote description set');
  peerConnection.createAnswer(gotAnswer);
  
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
  peerConnection.setRemoteDescription(remoteDesc);
  trace('Remote description set');
}

function gotAnswer(desc) {
  //trace('Local description\n' + desc.sdp);
  peerConnection.setLocalDescription(desc);
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
  channel.close();
  trace('Closed data channel with label: ' + channel.label);
  peerConnection.close();
  peerConnection = null;
  trace('Closed peer connection');
  startButton.disabled = false;
  dataChannelSend.value = "";
  dataChannelReceive.value = "";
  dataChannelSend.disabled = true;
  peer1_dataChannelSend.placeholder = "Set the remote description, enter some text, then press Send.";
}