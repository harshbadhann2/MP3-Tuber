const form = document.getElementById('converter-form');
const urlInput = document.getElementById('youtube-url');
const rightsCheck = document.getElementById('rights-check');
const statusLabel = document.getElementById('status-label');
const statusPercent = document.getElementById('status-percent');
const statusText = document.getElementById('status-text');
const progressFill = document.getElementById('progress-fill');
const resultCard = document.getElementById('result');
const resultMeta = document.getElementById('result-meta');
const downloadLink = document.getElementById('download-link');
const copyLinkBtn = document.getElementById('copy-link');
const diagnostics = document.getElementById('diagnostics');
const convertBtn = document.getElementById('convert-btn');
const pasteBtn = document.getElementById('paste-btn');
const clearBtn = document.getElementById('clear-btn');

let pollTimer = null;
let currentJobId = null;

function setStatus({ label, percent, message }) {
  if (label) statusLabel.textContent = label;
  if (typeof percent === 'number') {
    const safePercent = Math.min(100, Math.max(0, Math.round(percent)));
    statusPercent.textContent = `${safePercent}%`;
    progressFill.style.width = `${safePercent}%`;
  }
  if (message) statusText.textContent = message;
}

function setResultVisible(visible) {
  resultCard.classList.toggle('hidden', !visible);
}

function setDiagnostics(message) {
  if (!message) {
    diagnostics.classList.add('hidden');
    diagnostics.textContent = '';
    return;
  }
  diagnostics.textContent = message;
  diagnostics.classList.remove('hidden');
}

function disableForm(disabled) {
  convertBtn.disabled = disabled;
  urlInput.disabled = disabled;
  rightsCheck.disabled = disabled;
  pasteBtn.disabled = disabled;
  clearBtn.disabled = disabled;
}

function clearPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function loadDiagnostics() {
  try {
    const response = await fetch('/api/diagnostics');
    const data = await response.json();
    if (!data.ok) {
      setDiagnostics(`Server missing: ${data.missing.join(', ')}. Install dependencies to enable conversions.`);
    } else {
      setDiagnostics('');
    }
  } catch (error) {
    setDiagnostics('Unable to reach the server diagnostics.');
  }
}

async function pollStatus(jobId) {
  try {
    const response = await fetch(`/api/status/${jobId}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Unable to read status.');
    }

    setStatus({
      label: data.status === 'finished' ? 'Done' : 'Working',
      percent: data.progress ?? 0,
      message: data.message || 'Working on it.'
    });

    if (data.status === 'finished') {
      clearPolling();
      disableForm(false);
      downloadLink.href = data.downloadUrl;
      downloadLink.textContent = 'Download MP3';
      resultMeta.textContent = data.fileName ? `File: ${data.fileName}` : 'Your MP3 is ready.';
      setResultVisible(true);
      currentJobId = null;
    }

    if (data.status === 'failed') {
      clearPolling();
      disableForm(false);
      setStatus({ label: 'Failed', percent: 0, message: data.message || 'Conversion failed.' });
      currentJobId = null;
    }
  } catch (error) {
    clearPolling();
    disableForm(false);
    setStatus({ label: 'Error', percent: 0, message: error.message || 'Something went wrong.' });
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = urlInput.value.trim();

  setResultVisible(false);

  if (!rightsCheck.checked) {
    setStatus({ label: 'Action needed', percent: 0, message: 'Please confirm you have rights to download this content.' });
    return;
  }

  if (!url) {
    setStatus({ label: 'Action needed', percent: 0, message: 'Paste a valid YouTube link.' });
    return;
  }

  disableForm(true);
  setStatus({ label: 'Starting', percent: 5, message: 'Sending your link to the converter.' });

  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, rightsConfirmed: true })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Unable to start conversion.');
    }

    currentJobId = data.jobId;
    setStatus({ label: 'Working', percent: 8, message: 'Preparing your download.' });
    clearPolling();
    pollTimer = setInterval(() => pollStatus(data.jobId), 1200);
    pollStatus(data.jobId);
  } catch (error) {
    disableForm(false);
    setStatus({ label: 'Error', percent: 0, message: error.message || 'Conversion failed.' });
  }
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text.trim();
      setStatus({ label: 'Ready', percent: 0, message: 'Link pasted. Click Generate MP3.' });
    }
  } catch (error) {
    setStatus({ label: 'Notice', percent: 0, message: 'Clipboard access denied. Paste manually.' });
  }
});

clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  rightsCheck.checked = false;
  setResultVisible(false);
  clearPolling();
  setStatus({ label: 'Awaiting link', percent: 0, message: 'Paste a link to get started.' });
});

copyLinkBtn.addEventListener('click', async () => {
  if (!downloadLink.href || downloadLink.href === '#') {
    return;
  }
  try {
    await navigator.clipboard.writeText(downloadLink.href);
    copyLinkBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyLinkBtn.textContent = 'Copy link';
    }, 1500);
  } catch (error) {
    setStatus({ label: 'Notice', percent: 0, message: 'Unable to copy link.' });
  }
});

window.addEventListener('load', () => {
  loadDiagnostics();
  setStatus({ label: 'Awaiting link', percent: 0, message: 'Paste a link to get started.' });
});
