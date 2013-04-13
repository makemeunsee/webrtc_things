package broker;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Map.Entry;

import javax.servlet.http.HttpServletRequest;

import org.eclipse.jetty.websocket.WebSocket;
import org.eclipse.jetty.websocket.WebSocket.Connection;
import org.eclipse.jetty.websocket.WebSocketServlet;

public class BrokerWebSocketServlet extends WebSocketServlet {
	
	private static final long serialVersionUID = 1111789239761721289L;

    // web client messages headers

    // to client message headers
    public static final String OUT_JOINED = "in network with id";
    public static final String OUT_MEMBER_LIST = "members of network";
    public static final String OUT_WEBRTC_ANSWER = "answer from";
    public static final String OUT_WEBRTC_OFFER = "offer from";
    public static final String OUT_REQUEST_TIMEOUT = "request timeout";
    public static final String OUT_FRIEND_REQUEST = "wanna be friend";

    // from client message headers
    public static final String IN_LEAVE = "leave";
    public static final String IN_JOIN = "join";
    public static final String IN_REQUEST_CONTACT = "can i friend";
    public static final String IN_DENY_REQUEST = "no friend";
    public static final String IN_MAKE_WEBRTC_OFFER = "connect me to";
    public static final String IN_ACCEPT_WEBRTC_OFFER = "i accept gladly";

    private final Object lock = new Object();
	private static int connectionCount = 0;
	private final Map<String, Network> networks = new HashMap<String, Network>();

	@Override
	public WebSocket doWebSocketConnect(HttpServletRequest arg0, String arg1) {
		return new WebSocket.OnTextMessage() {
			
			UserSession session;
			
			@Override
			public void onOpen(Connection connection) {
				Integer id = null;
				synchronized(lock) {
					id = connectionCount++;
				}
				session = new UserSession(connection, id);
				System.out.println("Connection opened");
			}
			
			@Override
			public void onClose(int closeCode, String message) {
				String networkId = session.getNetworkId();
				Integer sessionId = session.getId();
				if(networkId != null) {
					networks.get(networkId).remove(sessionId);
					System.out.println(sessionId + " left network " + networkId);
					notifyAllMembersOfNetwork(networks.get(networkId));
					session.setNetworkId(null);
				}
				System.out.println("Closing socket with code: " + closeCode + " and message: " + message);
				session.getConnection().close();
			}
			
			@Override
			public void onMessage(String msg) {
				//System.out.println(msg);
				String networkId = session.getNetworkId();
				Integer sessionId = session.getId();
				if(msg.startsWith(IN_MAKE_WEBRTC_OFFER)) {
					// webrtc connection offer
					if(networkId != null) {
                        Network network = networks.get(networkId);
						try {
							String[] tokens = msg.split("_");
							if(tokens.length != 3) {
								System.out.println("Discarded corrupt offer message: " + msg);
								return;
							}
							// first token is IN_MAKE_WEBRTC_OFFER
							// second token is id of requested peer
							int requestedPeerIndex = Integer.parseInt(tokens[1]);
							//third token is sdp offer message
							String sdp = tokens[2];
							
							// if the request was pending, remove it
							network.removeContactPending(requestedPeerIndex, sessionId);
							
							network.get(Integer.valueOf(requestedPeerIndex)).getConnection().sendMessage(OUT_WEBRTC_OFFER + "_" + sessionId + "_" + sdp);
							System.out.println("Sent offer from " + sessionId + " to " + requestedPeerIndex);
						} catch (NumberFormatException e) {
							System.out.println("invalid request, bad id");
						} catch (IOException e) {
							System.out.println("error sendind msg, see below");
							e.printStackTrace(System.out);
						}
					} else {
						System.out.println("Not in a network, discarded offer msg");
					}
				} else if (msg.startsWith(IN_ACCEPT_WEBRTC_OFFER)) {
					// webrtc connection answer
					if(networkId != null) {
                        Network network = networks.get(networkId);
						String[] tokens = msg.split("_");
						if(tokens.length < 3) {
							System.out.println("Discarded corrupt answer message: " + msg);
							return;
						}
						// first token is IN_ACCEPT_WEBRTC_OFFER
						// second token is id of requesting peer
						int requestingPeerIndex = Integer.parseInt(tokens[1]);
						//all next tokens are the sdp answer message
						StringBuilder sb = new StringBuilder();
						for(int i = 2; i < tokens.length-2; ++i) {
							sb.append(tokens[i]);
							sb.append('_');
						}
						sb.append(tokens[tokens.length-1]);
						
						try {
							network.get(Integer.valueOf(requestingPeerIndex)).getConnection().sendMessage(OUT_WEBRTC_ANSWER + "_"+sessionId+"_"+sb.toString());
							System.out.println("Sent answer from " + sessionId + " to " + requestingPeerIndex);
						} catch (IOException e) {
							System.out.println("error sendind msg, see below");
							e.printStackTrace(System.out);
						}
					} else {
						System.out.println("Not in a network, discarded answer msg");
					}
				} else if (msg.startsWith(IN_JOIN)) {
					// request to join a network
					String[] tokens = msg.split("_");
					if(tokens.length < 2 || tokens[1].length() < 1) {
						System.out.println("Discarded corrupt join message: " + msg);
						return;
					}
					// leave the current network
					leaveNetwork(session);
					
					// first token is IN_JOIN
					// second token is id of network
					String newNetworkId = tokens[1];
					// other tokens is nickname
					if(tokens.length > 2) {
						StringBuilder sb = new StringBuilder();
						for(int i = 2; i < tokens.length-2; ++i) {
							sb.append(tokens[i]);
							sb.append('_');
						}
						sb.append(tokens[tokens.length-1]);
						session.setNick(sb.toString());
					}
					
					// join the requested network
                    Network network = networks.get(newNetworkId);
					if (network == null) {
						network = new Network(newNetworkId);
						networks.put(newNetworkId, network);
					}
					network.put(sessionId, session);
					session.setNetworkId(newNetworkId);
					System.out.println("UserSession " + sessionId + " joined network " + newNetworkId);
					
					// notify members of network of new member
					notifyAllMembersOfNetwork(network);
				} else if (msg.startsWith(IN_LEAVE)) {
					leaveNetwork(session);
				} else if (msg.startsWith(IN_REQUEST_CONTACT)) {
					// webrtc connection request
					if(networkId != null) {
                        Network network = networks.get(networkId);
						try {
							String[] tokens = msg.split("_");
							if(tokens.length != 2) {
								System.out.println("Discarded corrupt offer message: " + msg);
								return;
							}
							// first token is IN_REQUEST_CONTACT
							// second token is id of requested peer
							int requestedPeerIndex = Integer.parseInt(tokens[1]);
							
							if(!network.addNewContactPending(requestedPeerIndex, sessionId)) {
								System.out.println("request already pending between " + requestedPeerIndex + " and " + sessionId + " in network " + networkId);
								return;
							}
							
							network.get(Integer.valueOf(requestedPeerIndex)).getConnection().sendMessage(OUT_FRIEND_REQUEST + "_" + sessionId);
							System.out.println("Sent contact request from " + sessionId + " to " + requestedPeerIndex);
						} catch (NumberFormatException e) {
							System.out.println("invalid request, bad id");
						} catch (IOException e) {
							System.out.println("error sendind msg, see below");
							e.printStackTrace(System.out);
						}
					} else {
						System.out.println("Not in a network, discarded contact request msg");
					}
				} else if (msg.startsWith(IN_DENY_REQUEST)) {
					// webrtc connection request rejection
					if(networkId != null) {
                        Network network = networks.get(networkId);
						String[] tokens = msg.split("_");
						if(tokens.length != 2) {
							System.out.println("Discarded corrupt offer message: " + msg);
							return;
						}
						// first token is IN_DENY_REQUEST
						// second token is id of requested peer
						int requestedPeerIndex = Integer.parseInt(tokens[1]);
						network.removeContactPending(requestedPeerIndex, sessionId);
						
						// nothing, let the unwanted wait without knowing
						System.out.println("connection to " + requestedPeerIndex + " refused by " + sessionId + " in network " + networkId);
					}
				} else {
					System.out.println("Discarded message: " + msg);
				}
			}
		};
	}

    private synchronized void leaveNetwork(final UserSession session) {
        String networkId = session.getNetworkId();
        Integer sessionId = session.getId();
        if (networkId != null) {
            Network network = networks.get(networkId);
            network.remove(sessionId);
            session.setNetworkId(null);
            session.setNick(null);
            if (network.isEmpty()) {
                networks.remove(networkId);
            } else {
                notifyAllMembersOfNetwork(network);
            }
        }
    }
	
	private void notifyAllMembersOfNetwork(Network network) {
		for(Map.Entry<Integer, UserSession> c : network.entrySet()) {
			notifyMemberOfOtherMembers(c, network);
		}
	}

	private void notifyMemberOfOtherMembers(Entry<Integer, UserSession> member, Network network) {
		UserSession memberSession = member.getValue();
		Integer memberId = member.getKey();
		StringBuilder sb = new StringBuilder(OUT_MEMBER_LIST + "_");
		for(Entry<Integer, UserSession> s : network.entrySet()) {
			if(!s.getKey().equals(memberId)) {
				String nick = s.getValue().getNick();
				// no nick = invisible
				if(nick != null) {
					sb.append(s.getKey());
					sb.append("-");
					sb.append(nick);
					sb.append(" ");
				}
			}
		}
		
		try {
			memberSession.getConnection().sendMessage(OUT_JOINED + "_" + network.getId() + "_" + memberId);
			memberSession.getConnection().sendMessage(sb.toString());
		} catch (IOException e) {
			System.out.println("error sendind msg to " + memberId + ", see below");
			e.printStackTrace(System.out);
		}
	}
}
