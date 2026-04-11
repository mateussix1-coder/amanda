const { build } = require('vite');
build({
  root: '.',
  build: { write: false },
  define: { 'process.env.TEST_KEY': undefined }
}).then(() => console.log('done')).catch(console.error);
