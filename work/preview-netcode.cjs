require('../server.cjs').createPartyServer({port:4181,host:'127.0.0.1'}).listen().then(a=>console.log('Netcode preview: http://127.0.0.1:'+a.port));
