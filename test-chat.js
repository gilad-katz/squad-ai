const http = require('http');
const req = http.request('http://localhost:3001/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  res.on('data', d => process.stdout.write(d));
});
req.write(JSON.stringify({
  sessionId: 'session-1771693517132',
  messages: [{role: 'user', content: 'What files are in my workspace?'}]
}));
req.end();
