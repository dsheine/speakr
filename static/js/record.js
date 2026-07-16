/**
 * record.js – Minimal standalone Vue 3 app for /record
 *
 * Workflow: Start → Stop → Poll status → Show summary
 * Endpoints used (all existing, unmodified):
 *   POST /upload                           — upload recorded blob
 *   GET  /recording/<id>/status            — lightweight status poll
 *   GET  /status/<id>                      — full recording data (title + summary)
 */

const { createApp, ref, computed, onBeforeUnmount } = Vue;

// ── helpers ──────────────────────────────────────────────────────────────────

function getCsrf() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
}

function fmtSeconds(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
        ? [h, m, sec].map(v => String(v).padStart(2, '0')).join(':')
        : [m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

function mdToHtml(md) {
    if (!md) return '';
    let h = md
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/^\* (.+)$/gm, '<li>$1</li>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    h = `<p>${h}</p>`;
    h = h.replace(/<p>(\s*(?:<li>.*?<\/li>\s*)+)<\/p>/gs, '<ul>$1</ul>');
    return h;
}

// ── Vue App ───────────────────────────────────────────────────────────────────

createApp({
    setup() {
        const currentStep    = ref(1);
        const busy           = ref(false);
        const errorMessage   = ref('');

        // recorder internals
        const mediaRecorder  = ref(null);
        const mediaStream    = ref(null);
        const chunks         = ref([]);
        const elapsedSeconds = ref(0);
        const clockTimer     = ref(null);

        // after upload
        const recordingId    = ref(null);
        const recordingTitle = ref('');
        const summary        = ref('');
        const rawStatus      = ref('');
        const processingMessage = ref('');
        const progressPercent   = ref(10);
        const pollTimer      = ref(null);

        // ── computed ───────────────────────────────────────────────────────

        const formattedTime = computed(() => fmtSeconds(elapsedSeconds.value));

        const fullRecordingUrl = computed(() =>
            recordingId.value ? `/recordings/${recordingId.value}` : '/'
        );

        const summaryHtml = computed(() => mdToHtml(summary.value));

        const statusLabel = computed(() => {
            switch ((rawStatus.value || '').toUpperCase()) {
                case 'PENDING':      return 'Warteschlange';
                case 'STITCHING':    return 'Audio wird zusammengesetzt';
                case 'PROCESSING':   return 'Verarbeitung';
                case 'TRANSCRIBING': return 'Transkription';
                case 'SUMMARIZING':  return 'Zusammenfassung';
                case 'COMPLETED':    return 'Abgeschlossen';
                case 'FAILED':       return 'Fehlgeschlagen';
                default:             return rawStatus.value || 'Vorbereitung';
            }
        });

        // ── helpers ────────────────────────────────────────────────────────

        function stopTimers() {
            if (clockTimer.value)  { clearInterval(clockTimer.value);  clockTimer.value  = null; }
            if (pollTimer.value)   { clearTimeout(pollTimer.value);    pollTimer.value   = null; }
        }

        function stopStream() {
            if (mediaStream.value) {
                mediaStream.value.getTracks().forEach(t => t.stop());
                mediaStream.value = null;
            }
        }

        // ── actions ────────────────────────────────────────────────────────

        async function startRecording() {
            errorMessage.value = '';
            busy.value = true;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaStream.value = stream;
                chunks.value = [];
                const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus' : 'audio/webm';
                const rec = new MediaRecorder(stream, { mimeType: mime });
                rec.ondataavailable = e => { if (e.data?.size > 0) chunks.value.push(e.data); };
                rec.onstop = () => uploadRecording().catch(err => {
                    errorMessage.value = err.message || 'Upload fehlgeschlagen.';
                    currentStep.value = 1;
                    busy.value = false;
                });
                mediaRecorder.value = rec;
                elapsedSeconds.value = 0;
                rec.start();
                clockTimer.value = setInterval(() => elapsedSeconds.value++, 1000);
                currentStep.value = 2;
            } catch {
                errorMessage.value = 'Mikrofon-Zugriff verweigert. Bitte Berechtigung erteilen und erneut versuchen.';
            } finally {
                busy.value = false;
            }
        }

        function stopRecording() {
            if (!mediaRecorder.value || mediaRecorder.value.state === 'inactive') return;
            stopTimers();
            currentStep.value = 3;
            processingMessage.value = 'Aufnahme wird abgeschlossen…';
            progressPercent.value = 15;
            busy.value = true;
            mediaRecorder.value.stop();
            stopStream();
        }

        async function uploadRecording() {
            processingMessage.value = 'Wird hochgeladen…';
            progressPercent.value = 25;
            const mimeType = chunks.value[0]?.type || 'audio/webm';
            const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
            const blob = new Blob(chunks.value, { type: mimeType });
            const form = new FormData();
            form.append('file', new File([blob], `recording.${ext}`, { type: mimeType }));

            const resp = await fetch('/upload', {
                method: 'POST',
                headers: { 'X-CSRFToken': getCsrf() },
                body: form,
                credentials: 'same-origin',
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

            recordingId.value    = data.id;
            recordingTitle.value = data.title || 'Aufnahme';
            rawStatus.value      = data.status || 'PENDING';
            progressPercent.value = 40;
            processingMessage.value = 'Verarbeitung gestartet…';
            schedulePoll();
        }

        function schedulePoll() {
            pollTimer.value = setTimeout(pollStatus, 2500);
        }

        async function pollStatus() {
            if (!recordingId.value) return;
            try {
                const resp = await fetch(`/recording/${recordingId.value}/status`, {
                    credentials: 'same-origin',
                });
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

                rawStatus.value = data.status || '';
                const st = rawStatus.value.toUpperCase();

                if      (st === 'PENDING')      { progressPercent.value = 45; processingMessage.value = 'In der Warteschlange…'; }
                else if (st === 'STITCHING')     { progressPercent.value = 55; processingMessage.value = 'Audio wird zusammengesetzt…'; }
                else if (st === 'PROCESSING' ||
                         st === 'TRANSCRIBING')  { progressPercent.value = 70; processingMessage.value = 'Transkription läuft…'; }
                else if (st === 'SUMMARIZING')   { progressPercent.value = 88; processingMessage.value = 'Zusammenfassung wird erstellt…'; }
                else if (st === 'COMPLETED')     {
                    progressPercent.value = 100;
                    processingMessage.value = 'Fertig!';
                    await loadSummary();
                    currentStep.value = 4;
                    busy.value = false;
                    return;
                } else if (st === 'FAILED') {
                    throw new Error('Verarbeitung fehlgeschlagen. Öffne die vollständige App für Details.');
                }
                schedulePoll();
            } catch (err) {
                errorMessage.value = err.message || 'Statusabfrage fehlgeschlagen.';
                busy.value = false;
            }
        }

        async function loadSummary() {
            const resp = await fetch(`/status/${recordingId.value}`, { credentials: 'same-origin' });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
            recordingTitle.value = data.title || 'Aufnahme';
            summary.value        = data.summary || '';
        }

        function resetFlow() {
            stopTimers();
            stopStream();
            if (mediaRecorder.value && mediaRecorder.value.state !== 'inactive') {
                mediaRecorder.value.stop();
            }
            mediaRecorder.value  = null;
            chunks.value         = [];
            elapsedSeconds.value = 0;
            recordingId.value    = null;
            recordingTitle.value = '';
            summary.value        = '';
            rawStatus.value      = '';
            processingMessage.value = '';
            progressPercent.value   = 10;
            errorMessage.value      = '';
            busy.value              = false;
            currentStep.value       = 1;
        }

        onBeforeUnmount(() => { stopTimers(); stopStream(); });

        return {
            currentStep, busy, errorMessage,
            formattedTime, statusLabel, processingMessage, progressPercent,
            summaryHtml, fullRecordingUrl, recordingTitle,
            startRecording, stopRecording, resetFlow,
        };
    },
}).mount('#record-app');
