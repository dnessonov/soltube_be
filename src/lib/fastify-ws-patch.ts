export function deriveWebSocketForFastifyConnection (connection: any, fastify: any) {
    let socket = connection.socket || (fastify as any).websocketServer?.clients?.values().next().value;
    let activeSocket = connection.socket || (connection as any)._socket;

    if(socket === undefined) {
        // throw new Error("Cannot calculate websocket connection");
        return undefined;
    }else{
        if(false && (socket._sender._socket._peername.address === activeSocket._peername.address) && (socket._sender._socket._peername.family === activeSocket._peername.family) && (socket._sender._socket._peername.port === activeSocket._peername.port)) {
            return socket;
        }else{
            const clientsSet = (fastify as any).websocketServer?.clients;
            if(clientsSet) {
                let _matchFound = false;
                for(const clientSck of clientsSet) {
                    if((clientSck._sender._socket._peername.address === activeSocket._peername.address) && (clientSck._sender._socket._peername.family === activeSocket._peername.family) && (clientSck._sender._socket._peername.port === activeSocket._peername.port)) {
                        socket = clientSck;
                        _matchFound = true;
                        break;
                    }
                }
                if(_matchFound) {
                    return socket;
                }else{
                    return undefined;
                }
            }
        }
    }
}