/**
 * Test & Development Server
 *
 *
 */
"use strict";
var http = require('http');
var Gun = require('gun');
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