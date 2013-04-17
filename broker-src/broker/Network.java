package broker;

import java.io.IOException;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import util.UnorderedPair;

public class Network extends HashMap<Integer, UserSession> {
    private static final long serialVersionUID = -597155903792227425L;
    private final String id;
    private final Map<UnorderedPair<Integer, Integer>, Date> pendingContactRequests =
            new HashMap<UnorderedPair<Integer, Integer>, Date>();

    private final Thread requestTimeoutThread = new Thread(new Runnable() {
        @Override
        public void run() {
            while (!isEmpty()) {
                try {
                    Thread.sleep(1000l);
                } catch (InterruptedException e) {
                    //dontcare
                }
                // eliminate old requests, timeout is 3 min
                final Date limit = new Date(new Date().getTime() - 3 * 60 * 1000l);
                final Set<UnorderedPair<Integer, Integer>> toRemove = new HashSet<UnorderedPair<Integer, Integer>>();
                synchronized (pendingContactRequests) {
                    for (final Map.Entry<UnorderedPair<Integer, Integer>, Date> entry : pendingContactRequests.entrySet()) {
                        if (entry.getValue().before(limit)) {
                            toRemove.add(entry.getKey());
                        }
                    }
                }
                for (final UnorderedPair<Integer, Integer> p : toRemove) {
                    removeContactPending(p.a, p.b);
                    try {
                        get(p.a).getConnection().sendMessage(BrokerWebSocketServlet.OUT_REQUEST_TIMEOUT + "_" + p.b);
                        get(p.b).getConnection().sendMessage(BrokerWebSocketServlet.OUT_REQUEST_TIMEOUT + "_" + p.a);
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
        if (!isContactPending(id1, id2)) {
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