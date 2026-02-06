const http = require('http');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const port = process.env.PORT || 3000;
const publicDir = path.join(process.cwd(), 'public');
const downloadsDir = path.join(process.cwd(), 'downloads');
const maxBodySize = 1024 * 1024; // 1 MB

fs.mkdirSync(downloadsDir, { recursive: true });

const jobs = new Map();

const allowedHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com'
]);

function isValidYouTubeUrl(input) {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }
    return allowedHosts.has(url.hostname.toLowerCase());
  } catch (error) {
    return false;
  }
}

function parsePercent(line) {
  const match = line.match(/(\d{1,3}(?:\.\d+)?)%/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (Number.isNaN(value)) {
    return null;
  }
  return Math.min(100, Math.max(0, value));
}

function createLineReader(stream, onLine) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim().length > 0) {
        onLine(line.trim());
      }
    }
  });
  stream.on('end', () => {
    if (buffer.trim().length > 0) {
      onLine(buffer.trim());
    }
  });
}

function commandExists(command, args) {
  try {
    const result = spawnSync(command, args, { stdio: 'ignore' });
    return result.status === 0;
  } catch (error) {
    return false;
  }
}

function checkDependencies() {
  const ytDlp = commandExists('yt-dlp', ['--version']);
  const ffmpeg = commandExists('ffmpeg', ['-version']);
  return { ytDlp, ffmpeg };
}

function createJob(url) {
  const id = crypto.randomUUID();
  const job = {
    id,
    url,
    status: 'queued',
    progress: 0,
    message: 'Queued',
    createdAt: Date.now(),
    fileName: null,
    filePath: null,
    error: null
  };
  jobs.set(id, job);
  return job;
}

function startJob(job) {
  const outputTemplate = path.join(downloadsDir, `${job.id}.%(ext)s`);
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--progress',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '-o', outputTemplate,
    job.url
  ];

  job.status = 'running';
  job.message = 'Starting download';
  job.progress = 2;

  const child = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  child.on('error', (error) => {
    job.status = 'failed';
    job.message = 'yt-dlp is not available on the server.';
    job.error = error.message;
  });

  createLineReader(child.stdout, (line) => {
    const percent = parsePercent(line);
    if (percent !== null) {
      job.progress = Math.max(job.progress, percent);
      job.message = 'Downloading audio';
      return;
    }
    if (line.toLowerCase().includes('extracting audio')) {
      job.message = 'Extracting MP3';
      job.progress = Math.max(job.progress, 90);
    }
  });

  createLineReader(child.stderr, (line) => {
    if (line.toLowerCase().includes('warning')) {
      return;
    }
    job.error = line;
  });

  child.on('close', (code) => {
    if (code === 0) {
      const expectedFile = path.join(downloadsDir, `${job.id}.mp3`);
      if (fs.existsSync(expectedFile)) {
        job.status = 'finished';
        job.progress = 100;
        job.filePath = expectedFile;
        job.fileName = path.basename(expectedFile);
        job.message = 'Ready to download';
      } else {
        const matches = fs.readdirSync(downloadsDir).filter((file) => file.startsWith(job.id));
        if (matches.length > 0) {
          const fileName = matches[0];
          job.status = 'finished';
          job.progress = 100;
          job.fileName = fileName;
          job.filePath = path.join(downloadsDir, fileName);
          job.message = 'Ready to download';
        } else {
          job.status = 'failed';
          job.message = 'The MP3 file could not be located.';
        }
      }
    } else {
      job.status = 'failed';
      job.message = job.error || 'Conversion failed. Please try another link.';
    }
  });
}

function cleanupOldDownloads() {
  const cutoff = Date.now() - 1000 * 60 * 60; // 1 hour
  for (const [id, job] of jobs.entries()) {
    if (job.status === 'finished' && job.filePath && job.createdAt < cutoff) {
      try {
        fs.unlinkSync(job.filePath);
      } catch (error) {
        // Ignore cleanup errors
      }
      jobs.delete(id);
    }
    if (job.status === 'failed' && job.createdAt < cutoff) {
      jobs.delete(id);
    }
  }

  const files = fs.readdirSync(downloadsDir);
  for (const file of files) {
    const filePath = path.join(downloadsDir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

setInterval(cleanupOldDownloads, 1000 * 60 * 10);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendText(res, statusCode, body) {
  const text = body || '';
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
}

function readRequestBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const body = await readRequestBody(req, maxBodySize);
  if (!body) {
    return {};
  }
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error('Invalid JSON');
  }
}

function getContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    case '.mp3':
      return 'audio/mpeg';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function safePublicPath(urlPath) {
  let pathname = decodeURIComponent(urlPath);
  if (pathname === '/') {
    pathname = '/index.html';
  }

  const resolvedPath = path.normalize(path.join(publicDir, pathname));
  const publicRoot = `${publicDir}${path.sep}`;

  if (resolvedPath !== publicDir && !resolvedPath.startsWith(publicRoot)) {
    return null;
  }

  return resolvedPath;
}

function serveStatic(req, res, pathname) {
  const filePath = safePublicPath(pathname);
  if (!filePath) {
    return sendText(res, 404, 'Not found');
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      return sendText(res, 404, 'Not found');
    }

    res.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => sendText(res, 500, 'Error reading file.'));
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/diagnostics' && req.method === 'GET') {
      const deps = checkDependencies();
      const missing = [];
      if (!deps.ytDlp) missing.push('yt-dlp');
      if (!deps.ffmpeg) missing.push('ffmpeg');

      return sendJson(res, 200, {
        ok: deps.ytDlp && deps.ffmpeg,
        missing,
        ytDlp: deps.ytDlp,
        ffmpeg: deps.ffmpeg
      });
    }

    if (pathname === '/api/convert') {
      if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method not allowed.' });
      }

      let payload;
      try {
        payload = await readJson(req);
      } catch (error) {
        return sendJson(res, 400, { error: error.message || 'Invalid request body.' });
      }

      const { url: targetUrl, rightsConfirmed } = payload || {};

      if (!rightsConfirmed) {
        return sendJson(res, 400, { error: 'Please confirm you have the rights to download this content.' });
      }

      if (!targetUrl || typeof targetUrl !== 'string' || !isValidYouTubeUrl(targetUrl)) {
        return sendJson(res, 400, { error: 'Please provide a valid YouTube link.' });
      }

      const deps = checkDependencies();
      if (!deps.ytDlp || !deps.ffmpeg) {
        return sendJson(res, 500, {
          error: 'Server is missing required dependencies. Install yt-dlp and ffmpeg to continue.'
        });
      }

      const job = createJob(targetUrl);
      startJob(job);
      return sendJson(res, 200, { jobId: job.id });
    }

    if (pathname.startsWith('/api/status/')) {
      if (req.method !== 'GET') {
        return sendJson(res, 405, { error: 'Method not allowed.' });
      }

      const id = pathname.split('/').pop();
      const job = jobs.get(id);
      if (!job) {
        return sendJson(res, 404, { error: 'Job not found.' });
      }

      return sendJson(res, 200, {
        id: job.id,
        status: job.status,
        progress: job.progress,
        message: job.message,
        downloadUrl: job.status === 'finished' ? `/api/download/${job.id}` : null,
        fileName: job.fileName
      });
    }

    if (pathname.startsWith('/api/download/')) {
      if (req.method !== 'GET') {
        return sendText(res, 405, 'Method not allowed.');
      }

      const id = pathname.split('/').pop();
      const job = jobs.get(id);
      if (!job || job.status !== 'finished' || !job.filePath) {
        return sendText(res, 404, 'File not available.');
      }

      fs.stat(job.filePath, (error, stat) => {
        if (error || !stat.isFile()) {
          return sendText(res, 404, 'File not available.');
        }

        const safeName = (job.fileName || 'audio.mp3').replace(/[\\/"]+/g, '_');
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${safeName}"`
        });

        const stream = fs.createReadStream(job.filePath);
        stream.on('error', () => sendText(res, 500, 'Error reading file.'));
        stream.pipe(res);
      });
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(req, res, pathname);
    }

    return sendText(res, 404, 'Not found');
  } catch (error) {
    return sendJson(res, 500, { error: 'Server error.' });
  }
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
