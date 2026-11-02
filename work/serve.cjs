require('../server.cjs').createPartyServer().listen().then(a=>console.log('http://127.0.0.1:'+a.port+'/'));
