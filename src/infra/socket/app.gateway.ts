import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface IClientSocketUser {
    phone: string;
    socketId: string
}

interface IPayloadMessage {
    commentId: any;
    userNameComment: any;
    commentMessage: any;
    phoneNumber: string;
    userIdComment: any;
    commentCreatedAt: string;
    linkId: number
}

@WebSocketGateway({
    cors: true,
})
export class AppGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    posts: any[] = []

    constructor() { }
    @WebSocketServer() server: Server;

    afterInit(server: Server) {
        console.log('Socket.IO server initialized');
    }

    async handleConnection(client: Socket) {
        console.log('Connection!')
    }

    handleDisconnect(client: Socket) {
        console.log('Ngat ket noi!.', client.id);
    }

    @SubscribeMessage('joinLink')
    handleJoin(@MessageBody() linkId: number, @ConnectedSocket() client: Socket) {
        console.log(`link-${linkId}`)
        client.join(`link-${linkId}`);
    }

    @SubscribeMessage('leaveLink')
    handleLeave(@MessageBody() linkId: number, @ConnectedSocket() client: Socket) {
        client.leave(`link-${linkId}`);
    }

    sendResponse(linkId: number, response: any) {
        this.server.to(`link-${linkId}`).emit('linkResponse', response);
    }

    @SubscribeMessage('receiveMessage')
    handleReloadListMessage(
        client: Socket,
        payload: IPayloadMessage,
    ) {
        this.server.to(`link-${payload.linkId}`).emit('linkResponse', payload);
    }
}