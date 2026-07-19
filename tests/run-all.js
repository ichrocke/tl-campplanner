/* Startet den lokalen Server und fuehrt alle *.spec.js nacheinander aus. */
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const PORT = process.env.CAMP_PORT || '8931';

const server = spawn('python3', ['-m', 'http.server', PORT, '--bind', '127.0.0.1'], {
    cwd: root,
    stdio: 'ignore',
});

const specs = fs.readdirSync(__dirname).filter(f => /\.spec\.js$/.test(f)).sort();

setTimeout(() => {
    let failed = 0;
    for (const s of specs) {
        console.log('\n=== ' + s + ' ===');
        const r = spawnSync('node', [path.join(__dirname, s)], { stdio: 'inherit', env: process.env });
        if (r.status !== 0) { failed++; console.log('--> FAILED (' + s + ')'); }
    }
    server.kill();
    console.log(failed ? `\n${failed} spec(s) FAILED` : '\nAll specs passed');
    process.exit(failed ? 1 : 0);
}, 1500);
