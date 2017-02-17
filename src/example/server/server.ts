/**
 * Test & Development Server
 * 
 */
// import * as path from 'path';
import * as http from 'http';
// import * as fs from 'fs';

import * as Gun from 'gun';

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


const port = 3800;
const ip = '127.0.0.1';



const gun = Gun({
  file: './data.json',
  s3: {
    key: '', // AWS Access Key
    secret: '', // AWS Secret Token
    bucket: '' // The bucket you want to save into
  }
});

const server = http.createServer(function (req, res) {

  if (gun.wsp.server(req, res)) {
    console.log(req.url);
    console.log(res.statusCode);

    return; // filters gun requests!
  }

});

gun.wsp(server);
server.listen(port, ip);

console.log('Server started on port', port, 'with /gun');

