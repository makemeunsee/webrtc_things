webrtc_things
=============

Tests and demos with and around webrtc.

Note: all these demos require Firefox Nightly or Chrome Canary, and interop is not yet achieved.


main.css & webrtc_common.js & adapter.js
----------------------------------------

Common files required by the demos.

[adapter.js source](http://code.google.com/p/webrtc-samples/source/browse/trunk/apprtc/js/adapter.js), available under the [new BSD license](http://opensource.org/licenses/BSD-3-Clause)

webrtc.html & webrtc_standalone.js
----------------------------------

A standalone demo of 2 way communication using webrtc inside the same page.

webrtc_manual_handshake.html & webrtc_manual.js
-----------------------------------------------

A failed demo of webrtc communication initiated without broker, by copying and pasting the handshake through another mean (up to the users: IM, email, etc.). The current timeout (~3sec) to conclude the handshake is preventing this to work, but maybe later it could be configured or specified somehow.

webrtc_websocket_broker.html & webrtc_websocket_broker.js
---------------------------------------------------------

A demo of webrtc communication initiated with a minimalist websocket broker (see broker-src).  
Intended to be provided from the broker homepage, but can be easily deployed elsewhere by setting up properly the broker uri.  
Interop between Nightly and Canary not yet successful, as the datachannel fails to open between the 2 browsers.

webrtc_peer_handshake.html & webrtc_peer_handshake.js
-----------------------------------------------------

Based on the previous demo, users join a network and can get in touch through the broker, but a peer handshaking is available too.  
For this to work, a user A must be in contact with both B and C, and B and C must not be in contact already. A can then use the 'Go between' tool to intermediate between B and C.  
For simplicity reasons, it was not implemented that B and C are able to refuse being put in contact.  
Canary is not supported, due to its current limit imposed on the size of messages exchanged through a datachannel. It could be bypassed by using a more complex protocol between peers and splitting messages.


broker-src
----------

Java code for a websocket Jetty servlet. Serves as broker for some of the previous demos.



Short attempt to describe the broker protocol:
- Peers connect using websocket to the broker.
- Peers join ('join_[networkid]_[nick]') a network of their choice, pick a nick or none to remain invisible.
- The broker sends joining peers a list of all visible peers in the network.
- Peers can request contact ('can i friend_[peerId]') with another peer to the broker.
- The broker transmit the request to the interested party ('wanna be friend_[requesterId]').
- Requested peer can refuse the contact ('no friend_[requesterId]') or accept and initiate a webRTC peer connection through the broker.
- Upon refusal, the requesting peer is not sent any special message.

The broker in fact transmits automatically offers and answers of webRTC peer connection from any to any peer inside a network, the choice is left to the client code to accept the webRTC connection or not.  
Here the client and server support a simple social protocol, allowing users to choose when to create the connection or not.
