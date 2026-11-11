/* Auri–Orion Audio Recorder. Local-only IndexedDB for crash-tolerant chunks. */
const AOAudioDB = (() => {
  const NAME = 'auri-orion-audio-recorder';
  const VERSION = 1;

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('recordings')) {
          db.createObjectStore('recordings', {keyPath: 'id'});
        }
        if (!db.objectStoreNames.contains('chunks')) {
          const store = db.createObjectStore('chunks', {keyPath: ['recordingId', 'seq']});
          store.createIndex('recordingId', 'recordingId', {unique: false});
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function transaction(storeName, mode, cb) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      let value;
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error || Error('Transacción cancelada')); };
      try { value = cb(tx.objectStore(storeName)); }
      catch (err) { tx.abort(); reject(err); }
    });
  }

  function requestValue(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function addRecording(rec) {
    return transaction('recordings', 'readwrite', s => s.put(rec));
  }
  async function getRecording(id) {
    const db = await open();
    try { return await requestValue(db.transaction('recordings', 'readonly').objectStore('recordings').get(id)); }
    finally { db.close(); }
  }
  async function patchRecording(id, patch) {
    const record = await getRecording(id);
    if (!record) return;
    return addRecording({...record, ...patch});
  }
  async function addChunk(recordingId, seq, blob) {
    return transaction('chunks', 'readwrite', s => s.put({recordingId, seq, blob}));
  }
  async function listRecordings() {
    const db = await open();
    try {
      const rows = await requestValue(db.transaction('recordings', 'readonly').objectStore('recordings').getAll());
      return rows.sort((a,b)=>b.startedAt-a.startedAt);
    } finally { db.close(); }
  }
  async function listChunks(recordingId) {
    const db = await open();
    try {
      const tx = db.transaction('chunks', 'readonly');
      const index = tx.objectStore('chunks').index('recordingId');
      const rows = await requestValue(index.getAll(IDBKeyRange.only(recordingId)));
      return rows.sort((a,b)=>a.seq-b.seq);
    } finally { db.close(); }
  }
  async function removeRecording(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['recordings','chunks'], 'readwrite');
      tx.objectStore('recordings').delete(id);
      const store = tx.objectStore('chunks');
      const cursor = store.index('recordingId').openKeyCursor(IDBKeyRange.only(id));
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) { store.delete(c.primaryKey); c.continue(); }
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  return {open, addRecording, getRecording, patchRecording, addChunk, listRecordings, listChunks, removeRecording};
})();
