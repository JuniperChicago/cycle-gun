"use strict";
/**
 * Test & Development Server
 *
 */
// import * as path from 'path';
var http = require('http');
// import * as fs from 'fs';
var Gun = require('gun');
// import { SocketMessage } from './Types';
// import * as ws from 'ws';
// const wss = new ws.Server({ port: 8100 });
// function unloadMessage(message) {
//   return JSON.parse(message);
// }
// function loadMessage(typeKey: string, payload: any) {
//   return JSON.stringify({ typeKey, payload })
// }
// function sendFactory(socket) {
//   return (typeKey, payload) => {
//     socket.send(loadMessage(typeKey, payload));
//   }
// }
var port = 3800;
var ip = '127.0.0.1';
var gun = Gun({
    file: './data.json',
    s3: {
        key: '',
        secret: '',
        bucket: '' // The bucket you want to save into
    }
});
var server = http.createServer(function (req, res) {
    if (gun.wsp.server(req, res)) {
        console.log(req.url);
        console.log(res.statusCode);
        return; // filters gun requests!
    }
});
gun.wsp(server);
server.listen(port, ip);
console.log('Server started on port', port, 'with /gun');
//# sourceMappingURL=server.js.map