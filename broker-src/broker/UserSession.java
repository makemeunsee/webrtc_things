package broker;

import org.eclipse.jetty.websocket.WebSocket;
import org.eclipse.jetty.websocket.WebSocket.Connection;

public class UserSession {

    private final Connection connection;
    private String myNetworkId;
    private final Integer id;
    private String nick;

    public UserSession(Connection _connection, Integer _id) {
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

}