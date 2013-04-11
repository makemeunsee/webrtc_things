package broker;

import java.io.IOException;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;

import javax.servlet.http.HttpServletRequest;

import org.eclipse.jetty.websocket.WebSocket;
import org.eclipse.jetty.websocket.WebSocket.Connection;
import org.eclipse.jetty.websocket.WebSocketServlet;

public class BrokerWebSocketServlet extends WebSocketServlet {
	
	private static final long serialVersionUID = 1111789239761721289L;

    private final Object lock = new Object();
	private static int connectionCount = 0;
	private final Map<String, Network> networks = new HashMap<String, Network>();
	
	public class Session {
		public Session(Connection _connection, Integer _id) {
			connection = _connection;
			id = _id;
		}
		
		public String getNetworkId() {
			return myNetworkId;
		}
		
		public void setNetworkId(String networkId) {
			myNetworkId = networkId;
		}
		
		public Integer getId() {
			return id;
		}
		
		public String getNick() {
			return nick;
		}
		
		public void setNick(String _nick) {
			nick = _nick;
		}
		
		public Connection getConnection() {
			return connection;
		}
		
		final Connection connection;
		
		String myNetworkId;
		
		final Integer id;
		
		String nick;
	}
	
	public static class UnorderedPair<A,B> {
		final A a;
		final B b;
		private UnorderedPair(A _a, B _b) {
			a = _a;
			b = _b;
		}
		public static <A, B> UnorderedPair<A, B> pair(A _a, B _b) {
			return new UnorderedPair<A, B>(_a, _b);
		}
		
		@Override
		public int hashCode() {
			return (a == null ? 0 : a.hashCode()) + (b == null ? 0 : b.hashCode());
		}
		
		@Override
		public boolean equals(final Object o) {
			if(o instanceof UnorderedPair) {
				UnorderedPair<?, ?> p = (UnorderedPair<?, ?>) o;
				return ((a == p.a || a != null && a.equals(p.a)) &&
						(b == p.b || b != null && b.equals(p.b))) ||
						((a == p.b || a != null && a.equals(p.b)) &&
						(b == p.a || b != null && b.equals(p.a)));
			}
			return false;
		}
		
	}
	
	public class Network extends HashMap<Integer, Session> {
		private static final long serialVersionUID = -597155903792227425L;
		private final String id;
		private final Map<UnorderedPair<Integer, Integer>, Date> pendingContactRequests =
				new HashMap<UnorderedPair<Integer, Integer>, Date>();
		
		private final Thread requestTimeoutThread = new Thread(new Runnable(){
			@Override
			public void run() {
				while(true) {
					try{
						Thread.sleep(1000l);
					} catch(InterruptedException e) {
						//dontcare
					}
					// eliminate old requests, timeout is 3 min
					final Date limit = new Date(new Date().getTime() - 3*60*1000l);
					final Set<UnorderedPair<Integer, Integer>> toRemove = new HashSet<UnorderedPair<Integer,Integer>>();
					synchronized (pendingContactRequests) {
						for(final Map.Entry<UnorderedPair<Integer, Integer>, Date> entry : pendingContactRequests.entrySet()) {
							if(entry.getValue().before(limit)) {
								toRemove.add(entry.getKey());
							}
						}
					}
					for(final UnorderedPair<Integer, Integer> p : toRemove) {
						removeContactPending(p.a, p.b);
						try {
							get(p.a).getConnection().sendMessage("request timeout_" + p.b);
							get(p.b).getConnection().sendMessage("request timeout_" + p.a);
						} catch (IOException e) {
							System.out.println("error sendind msg, see below");
							e.printStackTrace(System.out);
						}
					}
				}
			}
		});
		
		public Network(final String _id) {
			id = _id;
			requestTimeoutThread.start();
		}
		
		public String getId() {
			return id;
		}
		
		public boolean addNewContactPending(final Integer id1, final Integer id2) {
			if(!isContactPending(id1, id2)){
				final Date now = new Date();
				synchronized (pendingContactRequests) {
					pendingContactRequests.put(UnorderedPair.pair(id1, id2), now);
				}
				return true;
			}
			return false;
		}
		
		public boolean isContactPending(final Integer id1, final Integer id2) {
			synchronized (pendingContactRequests) {
				return pendingContactRequests.containsKey(UnorderedPair.pair(id1, id2));
			}
		}
		
		public void removeContactPending(final Integer id1, final Integer id2) {
			synchronized (pendingContactRequests) {
				pendingContactRequests.remove(UnorderedPair.pair(id1, id2));
			}
		}
	}
	
	@Override
	public WebSocket doWebSocketConnect(HttpServletRequest arg0, String arg1) {
		return new WebSocket.OnTextMessage() {
			
			Session session;
			
			@Override
			public void onOpen(Connection connection) {
				Integer id = null;
				synchronized(lock) {
					id = Integer.valueOf(connectionCount++);
				}
				session = new Session(connection, id);
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
				if(msg.startsWith("connect me to")) {
					// webrtc connection offer
					if(networkId != null) {
						Network network = networks.get(networkId);
						try {
							String[] tokens = msg.split("_");
							if(tokens.length != 3) {
								System.out.println("Discarded corrupt offer message: " + msg);
								return;
							}
							// first token is "connect me to"
							// second token is id of requested peer
							int requestedPeerIndex = Integer.parseInt(tokens[1]);
							//third token is sdp offer message
							String sdp = tokens[2];
							
							// if the request was pending, remove it
							network.removeContactPending(Integer.valueOf(requestedPeerIndex), sessionId);
							
							network.get(Integer.valueOf(requestedPeerIndex)).getConnection().sendMessage("offer from_"+sessionId+"_"+sdp);
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
				} else if (msg.startsWith("i accept gladly")) {
					// webrtc connection answer
					if(networkId != null) {
						Network network = networks.get(networkId);
						String[] tokens = msg.split("_");
						if(tokens.length < 3) {
							System.out.println("Discarded corrupt answer message: " + msg);
							return;
						}
						// first token is "i accept gladly"
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
							network.get(Integer.valueOf(requestingPeerIndex)).getConnection().sendMessage("answer from_"+sessionId+"_"+sb.toString());
							System.out.println("Sent answer from " + sessionId + " to " + requestingPeerIndex);
						} catch (IOException e) {
							System.out.println("error sendind msg, see below");
							e.printStackTrace(System.out);
						}
					} else {
						System.out.println("Not in a network, discarded answer msg");
					}
				} else if (msg.startsWith("join")) {
					// request to join a network
					String[] tokens = msg.split("_");
					if(tokens.length < 2 || tokens[1].length() < 1) {
						System.out.println("Discarded corrupt join message: " + msg);
						return;
					}
					// leave the current network
					leaveNetwork();
					
					// first token is "join"
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
					System.out.println("Session " + sessionId + " joined network " + newNetworkId);
					
					// notify members of network of new member
					notifyAllMembersOfNetwork(network);
				} else if (msg.startsWith("leave")) {
					leaveNetwork();
				} else if (msg.startsWith("can i friend")) {
					// webrtc connection request
					if(networkId != null) {
						Network network = networks.get(networkId);
						try {
							String[] tokens = msg.split("_");
							if(tokens.length != 2) {
								System.out.println("Discarded corrupt offer message: " + msg);
								return;
							}
							// first token is "can i friend"
							// second token is id of requested peer
							int requestedPeerIndex = Integer.parseInt(tokens[1]);
							
							if(!network.addNewContactPending(Integer.valueOf(requestedPeerIndex), sessionId)) {
								System.out.println("request already pending between " + requestedPeerIndex + " and " + sessionId + " in network " + networkId);
								return;
							}
							
							network.get(Integer.valueOf(requestedPeerIndex)).getConnection().sendMessage("wanna be friend_"+sessionId);
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
				} else if (msg.startsWith("no friend")) {
					// webrtc connection request rejection
					if(networkId != null) {
						Network network = networks.get(networkId);
						String[] tokens = msg.split("_");
						if(tokens.length != 2) {
							System.out.println("Discarded corrupt offer message: " + msg);
							return;
						}
						// first token is "no friend"
						// second token is id of requested peer
						int requestedPeerIndex = Integer.parseInt(tokens[1]);
						network.removeContactPending(Integer.valueOf(requestedPeerIndex), sessionId);
						
						// nothing, let the unwanted wait without knowing
						System.out.println("connection to " + requestedPeerIndex + " refused by " + sessionId + " in network " + networkId);
					}
				} else {
					System.out.println("Discarded message: " + msg);
				}
			}
			
			private synchronized void leaveNetwork() {
				String networkId = session.getNetworkId();
				Integer sessionId = session.getId();
				if (networkId != null) {
					Network network = networks.get(networkId);
					network.remove(sessionId);
					session.setNetworkId(null);
					session.setNick(null);
					notifyAllMembersOfNetwork(network);
				}
			}
		};
	}
	
	private void notifyAllMembersOfNetwork(Network network) {
		for(Map.Entry<Integer, Session> c : network.entrySet()) {
			notifyMemberOfOtherMembers(c, network);
		}
	}

	private void notifyMemberOfOtherMembers(Entry<Integer, Session> member, Network network) {
		Session memberSession = member.getValue();
		Integer memberId = member.getKey();
		StringBuilder sb = new StringBuilder("members of network_");
		for(Entry<Integer, Session> s : network.entrySet()) {
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
			memberSession.getConnection().sendMessage("in network with id_" + network.getId() + "_" + memberId);
			memberSession.getConnection().sendMessage(sb.toString());
		} catch (IOException e) {
			System.out.println("error sendind msg to " + memberId + ", see below");
			e.printStackTrace(System.out);
		}
	}
}
