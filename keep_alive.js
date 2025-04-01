// keep_alive.js

import http from 'http';

const startServer = () => {
  const server = http.createServer((req, res) => {
    res.write("I'm alive");
    res.end();
  });

  server.listen(8080, () => {
    console.log('Server is running on port 8080');
  });
};

export default startServer;
