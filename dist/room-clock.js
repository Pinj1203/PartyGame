// A separate clock keeps the hosting simulation running when rendering pauses.
let timer;
self.onmessage=e=>{clearInterval(timer);if(e.data==='start')timer=setInterval(()=>postMessage('tick'),1000/60);};
